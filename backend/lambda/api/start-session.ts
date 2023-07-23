import * as ddb from 'aws-sdk/clients/dynamodb';
import * as crypto from 'crypto';
import {
    SESSION_TO_CLIENTS_TABLE_NAME,
    CLIENT_TO_SESSION_TABLE_NAME,
    SESSION_QUEUE_ENV_VAR,
    SessionToClientsItem,
    ClientToSessionItem,
    SessionQueueMessage,
    ClientType
  } from '../../../constants/constants';
import SQS = require('aws-sdk/clients/sqs');

const PARAMETER_ERROR = { statusCode: 400, body: 'Missing required parameters' };
const INTERNAL_ERROR = { statusCode: 500, body: '' };

const db = new ddb.DocumentClient();
const qs = new SQS();

export const handler = async (event: any = {}): Promise<any> => {
  const requestBody: string = event.body;
  if (!requestBody) {
    return PARAMETER_ERROR;
  }
  const clientId: string = JSON.parse(requestBody).clientId;
  const clientType: number = JSON.parse(requestBody).clientType;
  if (!clientId || !clientType) {
    return PARAMETER_ERROR;
  }

  const sessionId: string = crypto.randomUUID();

  const sessionItem: SessionToClientsItem = {
    sessionId,
    host: clientId,
    clientIds: { type: 'String', values: [] }
  };
  const sessionParams: ddb.DocumentClient.PutItemInput = {
    TableName: SESSION_TO_CLIENTS_TABLE_NAME,
    Item: sessionItem
  };

  const clientItem: ClientToSessionItem = { clientId, sessionId, clientType, host: true };
  const clientParams: ddb.DocumentClient.PutItemInput = {
    TableName: CLIENT_TO_SESSION_TABLE_NAME,
    Item: clientItem
  };

  const transactionParams: ddb.DocumentClient.TransactWriteItemsInput = {
    TransactItems: [
      { Put: sessionParams },
      { Put: clientParams }
    ] 
  };

  const queueUrl = process.env[SESSION_QUEUE_ENV_VAR];
  if (!queueUrl) {
    return INTERNAL_ERROR;
  }
  const messageBody: SessionQueueMessage = { sessionId };
  const messageParams: SQS.SendMessageRequest = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(messageBody)
  };

  try {
    await qs.sendMessage(messageParams).promise();
    await db.transactWrite(transactionParams).promise();
    return { statusCode: 201, body: { sessionId } };
  } catch (error) {
    return INTERNAL_ERROR;
  }
};

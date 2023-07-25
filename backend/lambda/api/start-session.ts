import * as ddb from 'aws-sdk/clients/dynamodb';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import {
    SESSION_TO_CLIENTS_TABLE_NAME,
    CLIENT_TO_SESSION_TABLE_NAME,
    CLIENT_TO_SESSION_PRIMARY_KEY,
    SESSION_QUEUE_ENV_VAR,
    SessionToClientsItem,
    ClientToSessionItem,
    SessionQueueMessage,
    ClientType
  } from '../../../constants/constants';
import SQS = require('aws-sdk/clients/sqs');

export type StartSessionRequest = {
  accessToken: string,
  refreshToken: string,
  clientType: ClientType
}; 

const PARAMETER_ERROR = { statusCode: 400, body: 'Missing required parameters' };
const INTERNAL_ERROR = { statusCode: 500, body: '' };
const APPLE_MUSIC_ERROR = { statusCode: 500, body: 'Apple Music integration not yet implemented' };

const db = new ddb.DocumentClient();
const qs = new SQS();

export const handler = async (event: any = {}): Promise<any> => {
  const requestBody: string = event.body;
  if (!requestBody) {
    return PARAMETER_ERROR;
  }
  const request: StartSessionRequest = JSON.parse(requestBody);
  const accessToken: string = request.accessToken;
  const refreshToken: string = request.refreshToken;
  const clientType: ClientType = request.clientType;
  if (!accessToken || !refreshToken || clientType == undefined) {
    return PARAMETER_ERROR;
  }

  let clientId;
  if (clientType == ClientType.SPOTIFY) {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: 'Bearer ' + accessToken
      }
    });
    const data = await response.json() as { uri: string };
    clientId = data.uri;
  } else {
    return APPLE_MUSIC_ERROR;
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

  const clientItem: ClientToSessionItem = { clientId, sessionId, clientType, accessToken, refreshToken, host: true };
  const clientParams: ddb.DocumentClient.PutItemInput = {
    TableName: CLIENT_TO_SESSION_TABLE_NAME,
    Item: clientItem,
    ConditionExpression: `attribute_not_exists(${CLIENT_TO_SESSION_PRIMARY_KEY})`,
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
    return { statusCode: 201, body: { clientId, sessionId } };
  } catch (error) {
    return INTERNAL_ERROR;
  }
};

import * as ddb from 'aws-sdk/clients/dynamodb';
import {
    SESSION_TO_CLIENTS_TABLE_NAME,
    SESSION_TO_CLIENTS_PRIMARY_KEY,
    SESSION_TO_CLIENTS_CLIENT_LIST,
    CLIENT_TO_SESSION_TABLE_NAME,
    CLIENT_TO_SESSION_PRIMARY_KEY,
    ClientToSessionItem,
  } from '../../../constants/constants';

const PARAMETER_ERROR = { statusCode: 400, body: 'Missing required parameters' };
const INTERNAL_ERROR = { statusCode: 500, body: '' };

const db = new ddb.DocumentClient();

export const handler = async (event: any = {}): Promise<any> => {
  const requestBody = event.body;
  if (!requestBody) {
    return PARAMETER_ERROR;
  }
  const clientId: string = JSON.parse(requestBody).clientId;
  const sessionId: string = JSON.parse(requestBody).sessionId;
  const clientType: number = JSON.parse(requestBody).clientType;
  if (!clientId || !sessionId || !clientType) {
    return PARAMETER_ERROR;
  }

  const clientItem: ClientToSessionItem = { clientId, sessionId, clientType, host: false };
  const clientParams: ddb.DocumentClient.PutItemInput = {
    TableName: CLIENT_TO_SESSION_TABLE_NAME,
    Item: clientItem,
    ConditionExpression: `attribute_not_exists(${CLIENT_TO_SESSION_PRIMARY_KEY})`,
  };

  const updateClientListParams: ddb.DocumentClient.Update = {
    TableName: SESSION_TO_CLIENTS_TABLE_NAME,
    Key: { [SESSION_TO_CLIENTS_PRIMARY_KEY]: sessionId },
    UpdateExpression: 'ADD #clients :clientId',
    ExpressionAttributeNames: { '#clients': SESSION_TO_CLIENTS_CLIENT_LIST },
    ExpressionAttributeValues: { ':clientId': db.createSet([clientId]) }
  };

  const transactionParams: ddb.DocumentClient.TransactWriteItemsInput = {
    TransactItems: [
      { Update: updateClientListParams },
      { Put: clientParams }
    ] 
  };

  try {
    await db.transactWrite(transactionParams).promise();
    return { statusCode: 201, body: { sessionId } };
  } catch (error) {
    return INTERNAL_ERROR;
  }
};

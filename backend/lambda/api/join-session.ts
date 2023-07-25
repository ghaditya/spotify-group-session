import * as ddb from 'aws-sdk/clients/dynamodb';
import fetch from 'node-fetch';
import {
    SESSION_TO_CLIENTS_TABLE_NAME,
    SESSION_TO_CLIENTS_PRIMARY_KEY,
    SESSION_TO_CLIENTS_CLIENT_LIST,
    CLIENT_TO_SESSION_TABLE_NAME,
    CLIENT_TO_SESSION_PRIMARY_KEY,
    ClientToSessionItem,
    ClientType
  } from '../../../constants/constants';

const PARAMETER_ERROR = { statusCode: 400, body: 'Missing required parameters' };
const INTERNAL_ERROR = { statusCode: 500, body: '' };
const APPLE_MUSIC_ERROR = { statusCode: 500, body: 'Apple Music integration not yet implemented' };


const db = new ddb.DocumentClient();

export type JoinSessionRequest = {
  sessionId: string,
  accessToken: string,
  refreshToken: string,
  clientType: ClientType
}; 

export const handler = async (event: any = {}): Promise<any> => {
  const requestBody = event.body;
  if (!requestBody) {
    return PARAMETER_ERROR;
  }
  const request: JoinSessionRequest = JSON.parse(requestBody);
  const accessToken: string = request.accessToken;
  const refreshToken: string = request.refreshToken;
  const clientType: ClientType = request.clientType;
  const sessionId: string = request.sessionId;
  if (!accessToken || !refreshToken || clientType == undefined || !sessionId) {
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

  const clientItem: ClientToSessionItem = { clientId, sessionId, clientType, host: false, accessToken, refreshToken };
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

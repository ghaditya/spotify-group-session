import * as ddb from 'aws-sdk/clients/dynamodb';
import {
    SESSION_TO_CLIENTS_TABLE_NAME,
    SESSION_TO_CLIENTS_PRIMARY_KEY,
    SESSION_TO_CLIENTS_CLIENT_LIST,
    CLIENT_TO_SESSION_TABLE_NAME,
    CLIENT_TO_SESSION_PRIMARY_KEY,
    ClientType
} from '../../../constants/constants';

const PARAMETER_ERROR = { statusCode: 400, body: 'Missing required parameters' };
const INTERNAL_ERROR = { statusCode: 500, body: '' };
const APPLE_MUSIC_ERROR = { statusCode: 500, body: 'Apple Music integration not yet implemented' };

const db = new ddb.DocumentClient();

export type LeaveSessionRequest = {
  accessToken: string,
  sessionId: string,
  clientType: ClientType
}; 

const endSession = async (clients: string[], sessionId: string): Promise<any> => {
  const deleteSessionParams: ddb.DocumentClient.Delete = {
    TableName: SESSION_TO_CLIENTS_TABLE_NAME,
    Key: { [SESSION_TO_CLIENTS_PRIMARY_KEY]: sessionId }
  };
  let transactItems: ddb.DocumentClient.TransactWriteItemList = [{ Delete: deleteSessionParams }];

  for (let i = 0; i < clients.length; ++i) {
    const deleteClientParams: ddb.DocumentClient.Delete = {
      TableName: CLIENT_TO_SESSION_TABLE_NAME,
      Key: { [CLIENT_TO_SESSION_PRIMARY_KEY]: clients[i] }
    };
    transactItems.push({ Delete: deleteClientParams });
  }

  const transactionParams: ddb.DocumentClient.TransactWriteItemsInput = {
    TransactItems: transactItems 
  };

  try {
    await db.transactWrite(transactionParams).promise();
    return { statusCode: 201, body: { sessionId } };
  } catch (error) {
    return INTERNAL_ERROR;
  }
};

const leaveSession = async (clientId: string, sessionId: string): Promise<any> => {
  const updateClientListParams: ddb.DocumentClient.Update = {
    TableName: SESSION_TO_CLIENTS_TABLE_NAME,
    Key: { [SESSION_TO_CLIENTS_PRIMARY_KEY]: sessionId },
    UpdateExpression: 'DELETE #clients :clientId',
    ExpressionAttributeNames: { '#clients': SESSION_TO_CLIENTS_CLIENT_LIST },
    ExpressionAttributeValues: { ':clientId': db.createSet([clientId]) }
  };

  const deleteClientParams: ddb.DocumentClient.Delete = {
    TableName: CLIENT_TO_SESSION_TABLE_NAME,
    Key: { [CLIENT_TO_SESSION_PRIMARY_KEY]: clientId }
  };

  const transactionParams: ddb.DocumentClient.TransactWriteItemsInput = {
    TransactItems: [
      { Update: updateClientListParams },
      { Delete: deleteClientParams }
    ] 
  };

  try {
    await db.transactWrite(transactionParams).promise();
    return { statusCode: 201, body: { sessionId } };
  } catch (error) {
    return INTERNAL_ERROR;
  }
};

export const handler = async (event: any = {}): Promise<any> => {
  const requestBody = event.body;
  if (!requestBody) {
    return PARAMETER_ERROR;
  }
  const request: LeaveSessionRequest = JSON.parse(requestBody);
  const accessToken: string = request.accessToken;
  const clientType: ClientType = request.clientType;
  const sessionId: string = request.sessionId;
  if (!accessToken || clientType == undefined || !sessionId) {
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

  const getSessionParams: ddb.DocumentClient.Get = {
    TableName: SESSION_TO_CLIENTS_TABLE_NAME,
    Key: { [SESSION_TO_CLIENTS_PRIMARY_KEY]: sessionId }
  };
  try {
    var sessionInfo = await db.get(getSessionParams).promise();
  } catch (error) {
    return INTERNAL_ERROR;
  }
  if (sessionInfo.Item == undefined) {
    return INTERNAL_ERROR;
  }
  if (sessionInfo.Item.host == clientId) {
    let clients: string[] = sessionInfo.Item[SESSION_TO_CLIENTS_CLIENT_LIST];
    clients.push(clientId);
    return endSession(clients, sessionId);
  } else {
    return leaveSession(clientId, sessionId);
  }
};

import * as ddb from 'aws-sdk/clients/dynamodb';
import {
    SESSION_TO_CLIENTS_TABLE_NAME,
    SESSION_TO_CLIENTS_PRIMARY_KEY,
    SESSION_TO_CLIENTS_CLIENT_LIST,
    CLIENT_TO_SESSION_TABLE_NAME,
    CLIENT_TO_SESSION_PRIMARY_KEY,
  } from '../../../constants/constants';

const PARAMETER_ERROR = { statusCode: 400, body: 'Missing required parameters' };
const INTERNAL_ERROR = { statusCode: 500, body: '' };

const db = new ddb.DocumentClient();

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
  const clientId: string = JSON.parse(requestBody).clientId;
  const sessionId: string = JSON.parse(requestBody).sessionId;
  if (!clientId || !sessionId) {
    return PARAMETER_ERROR;
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
    return endSession(clients, sessionId)
  } else {
    return leaveSession(clientId, sessionId);
  }
};

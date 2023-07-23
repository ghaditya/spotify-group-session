import * as ddb from 'aws-sdk/clients/dynamodb';
import {
    CLIENT_TO_SESSION_TABLE_NAME,
    CLIENT_TO_SESSION_PRIMARY_KEY,
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
  if (!clientId) {
    return PARAMETER_ERROR;
  }

  const getClientParams: ddb.DocumentClient.Get = {
    TableName: CLIENT_TO_SESSION_TABLE_NAME,
    Key: { [CLIENT_TO_SESSION_PRIMARY_KEY]: clientId }
  };
  try {
    var clientInfo = await db.get(getClientParams).promise();
  } catch (error) {
    return INTERNAL_ERROR;
  }
  if (clientInfo.Item == undefined) {
    return INTERNAL_ERROR;
  }
  return { statusCode: 201, body: JSON.stringify(clientInfo.Item) };
};

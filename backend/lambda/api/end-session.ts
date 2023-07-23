const parameterError = { statusCode: 400, body: 'Missing required parameters' };

export const handler = async (event: any = {}): Promise<any> => {
  const requestBody = event.body;
  if (!requestBody) {
    return parameterError;
  }
  const parsedRequest = JSON.parse(requestBody);
  if (!parsedRequest.clientId) {
    return parameterError;
  }
};

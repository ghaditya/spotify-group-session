import { DocumentClient } from 'aws-sdk/clients/dynamodb';

export const PREFIX = 'SpotifyGroupSessionStack';

export const SESSION_TO_CLIENTS_TABLE_NAME = PREFIX + 'SessionIdToClientIds';
export const SESSION_TO_CLIENTS_PRIMARY_KEY = 'sessionId';
export const SESSION_TO_CLIENTS_CLIENT_LIST = 'clientIds';
export const CLIENT_TO_SESSION_TABLE_NAME = PREFIX + 'ClientIdToSessionId';
export const CLIENT_TO_SESSION_PRIMARY_KEY = 'clientId';

export const SESSION_QUEUE_ENV_VAR = 'SESSION_QUEUE_URL';

export enum ClientType { SPOTIFY, APPLE_MUSIC };

export type SessionToClientsItem = {
  [SESSION_TO_CLIENTS_PRIMARY_KEY]: string,
  host: string,
  [SESSION_TO_CLIENTS_CLIENT_LIST]: DocumentClient.StringSet
};

export type ClientToSessionItem = {
  [CLIENT_TO_SESSION_PRIMARY_KEY]: string,
  sessionId: string,
  accessToken: string,
  refreshToken: string,
  clientType: ClientType,
  host: boolean
};

export type SessionQueueMessage = {
  sessionId: string
};

import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import {
  PREFIX,
  SESSION_TO_CLIENTS_TABLE_NAME,
  SESSION_TO_CLIENTS_PRIMARY_KEY,
  CLIENT_TO_SESSION_TABLE_NAME,
  CLIENT_TO_SESSION_PRIMARY_KEY,
  SESSION_QUEUE_ENV_VAR
} from '../constants/constants';

export class SpotifyGroupSessionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SQS Queue
    const sessionQueue = new sqs.Queue(this, PREFIX + 'SessionQueue', {
      retentionPeriod: cdk.Duration.minutes(30)
    });

    // DDB tables
    const sessionIdToClientIdsTable = new dynamodb.Table(this, PREFIX + 'SessionIdToClientIds', {
      partitionKey: { name: SESSION_TO_CLIENTS_PRIMARY_KEY, type: dynamodb.AttributeType.STRING },
      tableName: SESSION_TO_CLIENTS_TABLE_NAME
    });

    const clientIdToSessionIdTable = new dynamodb.Table(this, PREFIX + 'ClientIdToSessionId', {
      partitionKey: { name: CLIENT_TO_SESSION_PRIMARY_KEY, type: dynamodb.AttributeType.STRING },
      tableName: CLIENT_TO_SESSION_TABLE_NAME
    });

    // S3 Bucket
    const frontendBucket = new s3.Bucket(this, PREFIX + 'ViewBucket', {
      publicReadAccess: true
    });

    new s3deploy.BucketDeployment(this, PREFIX + 'DeployFrontend', {
      sources: [s3deploy.Source.asset('./frontend')],
      destinationBucket: frontendBucket
    })

    // Lambdas
    const refreshQueueLambda = new lambda.Function(this, PREFIX + 'RefreshQueueLambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'refresh-queue.handler',
      code: lambda.Code.fromAsset('backend/worker/'),
      environment: { [SESSION_QUEUE_ENV_VAR]: sessionQueue.queueUrl }
    });
  
    const startSessionLambda = new lambda.Function(this, PREFIX + 'StartSessionLambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'start-session.handler',
      code: lambda.Code.fromAsset('backend/api/'),
      environment: { [SESSION_QUEUE_ENV_VAR]: sessionQueue.queueUrl }
    });

    const endSessionLambda = new lambda.Function(this, PREFIX + 'EndSessionLambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'end-session.handler',
      code: lambda.Code.fromAsset('backend/api/'),
      environment: { [SESSION_QUEUE_ENV_VAR]: sessionQueue.queueUrl }
    });

    const joinSessionLambda = new lambda.Function(this, PREFIX + 'JoinSessionLambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'join-session.handler',
      code: lambda.Code.fromAsset('backend/api/'),
      environment: { [SESSION_QUEUE_ENV_VAR]: sessionQueue.queueUrl }
    });

    const leaveSessionLambda = new lambda.Function(this, PREFIX + 'LeaveSessionLambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'leave-session.handler',
      code: lambda.Code.fromAsset('backend/api/'),
      environment: { [SESSION_QUEUE_ENV_VAR]: sessionQueue.queueUrl }
    });

    const getClientStatusLambda = new lambda.Function(this, PREFIX + 'GetClientStatusLambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'get-client-status.handler',
      code: lambda.Code.fromAsset('backend/api/')
    });

    // API gateway
    const pageGateway = new apigateway.RestApi(this, PREFIX + 'PageGateway', {});

    // Paths
    const sessionApi = pageGateway.root.addResource('api');
    const s3Proxy = pageGateway.root.addResource('{file}');

    const startSessionApi = sessionApi.addResource('startSession');
    const endSessionApi = sessionApi.addResource('endSession');
    const joinSessionApi = sessionApi.addResource('joinSession');
    const leaveSessionApi = sessionApi.addResource('leaveSession');
    const getClientStatusApi = sessionApi.addResource('getClientStatus');

    // API to S3
    s3Proxy.addMethod('GET', new apigateway.AwsIntegration({
      service: 's3',
      integrationHttpMethod: 'GET',
      path: PREFIX + 'ViewBucket/{file}',
      options: {
        requestParameters: {
          'integration.request.path.file': 'method.request.path.file'
        },
        integrationResponses: [{
          statusCode: "200"
        }]
      }
    }));

    // API to Lambda connections
    startSessionApi.addMethod('POST', new apigateway.LambdaIntegration(startSessionLambda, {}));
    endSessionApi.addMethod('POST', new apigateway.LambdaIntegration(endSessionLambda, {}));
    joinSessionApi.addMethod('POST', new apigateway.LambdaIntegration(joinSessionLambda, {}));
    leaveSessionApi.addMethod('POST', new apigateway.LambdaIntegration(leaveSessionLambda, {}));
    getClientStatusApi.addMethod('POST', new apigateway.LambdaIntegration(getClientStatusLambda, {}));

    // Lambda event source
    const refreshQueueEventSource = new SqsEventSource(sessionQueue);
    refreshQueueLambda.addEventSource(refreshQueueEventSource);

    // Permissions
    sessionQueue.grantSendMessages(refreshQueueLambda);

    sessionIdToClientIdsTable.grantReadData(refreshQueueLambda);
    sessionIdToClientIdsTable.grantReadWriteData(startSessionLambda);
    sessionIdToClientIdsTable.grantReadWriteData(endSessionLambda);
    sessionIdToClientIdsTable.grantReadWriteData(joinSessionLambda);
    sessionIdToClientIdsTable.grantReadWriteData(leaveSessionLambda);

    clientIdToSessionIdTable.grantReadData(getClientStatusLambda);
    clientIdToSessionIdTable.grantReadWriteData(endSessionLambda);
    clientIdToSessionIdTable.grantReadWriteData(joinSessionLambda);
    clientIdToSessionIdTable.grantReadWriteData(leaveSessionLambda);
    clientIdToSessionIdTable.grantReadWriteData(startSessionLambda);
  }
}

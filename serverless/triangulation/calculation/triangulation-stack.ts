import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export class TriangulationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Reference existing ECR repository
    const repo = ecr.Repository.fromRepositoryName(
      this,
      'TriangulationRepo',
      'triangulation-lambda'
    );

    // Create Lambda function from container image
    const triangulationFunction = new lambda.DockerImageFunction(this, 'TriangulationFunction', {
      code: lambda.DockerImageCode.fromEcr(repo),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      architecture: lambda.Architecture.ARM_64,
      environment: {}
    });

    // Add Function URL
    new lambda.FunctionUrl(this, 'TriangulationFunctionUrl', {
      function: triangulationFunction,
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.GET],
        allowedHeaders: ['*']
      }
    });

    // Output the Lambda function ARN
    new cdk.CfnOutput(this, 'TriangulationFunctionArn', {
      value: triangulationFunction.functionArn,
      description: 'The ARN of the Triangulation Lambda function'
    });
  }
} 
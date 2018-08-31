const AWS = require('aws-sdk');
const uuid = require('uuid');
const sns = new AWS.SNS();

const docClient = new AWS.DynamoDB.DocumentClient();

AWS.config.setPromisesDependency(null);

module.exports.handler = async function(event, context, callback) {
    var recordId = uuid.v4();
    var voice = event.voice;
    var text = event.text;

    console.log('Generating new DynamoDB record, with ID: ' + recordId);
    console.log('Input Text: ' + text);
    console.log('Selected voice: ' + voice);
    var param = {
        TableName: process.env.DB_TABLE_NAME,
        Item: {
            id: recordId,
            text,
            voice,
            status: 'PROCESSING'
        }
    };

    return new Promise((resolve, reject) => {
        //Creating new record in DynamoDB table
        docClient
        .put(param)
        .promise()
        .then((data) => {
            console.log('Create new post succeeded:', recordId);

            // Sending notification about new post to SNS
            var messageParam = {
                TopicArn: process.env.SNS_TOPIC,
                Message: recordId
            };
            sns.publish(messageParam).promise()
            .then((data) => {
                console.log(`Message ${messageParam.Message} send to the topic ${messageParam.TopicArn}`);
                console.log(`MessageID is ${data.MessageId}`);
                resolve(recordId);
            })
            .catch((err) => {
                console.error(err, err.stack);
                reject();
            })
        })
        .catch((err) => {
            console.log('Unable to put new post', text, ". Error JSON:", JSON.stringify(err, null, 2));
            reject();
        });
    })
};
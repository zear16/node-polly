const AWS = require('aws-sdk');

const docClient = new AWS.DynamoDB.DocumentClient();

module.exports.handler = (event, context, callback) => {
    var postId = event.postId;

    console.log(`postId: ${postId}`);
    if (postId === '*') {
        docClient.scan({
            TableName: process.env.DB_TABLE_NAME
        }, (err, data) => {
            if (err) {
                console.error(err, err.stack);
                callback(err);
            } else {
                callback(null, data);
            }
        });
    } else {
        var queryParam = {
            TableName: process.env.DB_TABLE_NAME,
            ExpressionAttributeNames: {
                '#id': 'id'
            },
            ExpressionAttributeValues: {
                ':id': postId
            },
            KeyConditionExpression: '#id = :id'
        };
        docClient.query(queryParam, (err, data) => {
            if (err) {
                console.error(err, err.stack);
                callback(err);
            } else {
                callback(null, data);
            }
        });
    }
};
const AWS = require('aws-sdk');

const docClient = new AWS.DynamoDB.DocumentClient();

module.exports.getPosts = async function(event, context, callback) {
    var postId = event.postId;

    var queryParam = {
        TableName: process.env.DB_TABLE_NAME,
        KeyConditionExpression: "Key('id').eq(postId)"
    };

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
        })
    } else {
        docClient.query(queryParam, (err, data) => {
            if (err) {
                console.error(err, err.stack);
                callback(err);
            } else {
                callback(null, data);
            }
        })
    }
};
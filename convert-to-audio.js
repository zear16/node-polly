const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const polly = new AWS.Polly();
const s3 = new AWS.S3();
const path = require('path');
const fs = require('fs');

AWS.config.setPromisesDependency(null);

module.exports.handler = async function (event, context, callback) {
    var postId = event.Records[0].Sns.Message;

    console.log("Text to Speech function. Post ID in DynamoDB: " + postId);

    // Retrieving information about the post from DynamoDB table
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

    return new Promise((resolve, reject) => {
        docClient.query(queryParam).promise()
        .then((data) => {
            var text = data.Items[0].text;
            var voice = data.Items[0].voice;

            // Because single invocation of the polly synthesize_speech api can
            // transform text with about 1,500 characters, we are dividing the
            // post into blocks of approximately 1,000 characters.
            var textBlocks = text.match(/.{1,1000}/g);

            console.log(`text: ${text}, voice: ${voice}`);

            // For each block, invoke Polly API, which will transform text into audio
            textBlocks.forEach(block => {
                console.log(block);
                polly.synthesizeSpeech({
                    Text: block,
                    VoiceId: voice,
                    OutputFormat: 'mp3'
                })
                .promise()
                .then((response) => {
                    // Save the audio stream returned by Amazon Polly on Lambda's temp
                    // directory. If there are multiple text blocks, the audio stream
                    // will be combined into a single file.
                    console.log(response);
                    var output = path.join('/tmp', postId);
                    if (response.AudioStream instanceof Buffer) {
                        fs.writeFileSync(output, response.AudioStream);
                        return fs.readFile(output);
                    }
                    throw 'AudioStream is not buffer';
                })
                .then((data) => {
                    console.log(data);
                    var uploadParams = {
                        Bucket: process.env.BUCKET_NAME,
                        Body: data,
                        Key: postId + '.mp3'
                    };
                    return s3.putObject(uploadParams).promise();
                })
                .then((data) => {
                    console.log(data);
                    return s3.putObjectAcl({
                        Bucket: process.env.BUCKET_NAME,
                        ACL: 'public-read',
                        Key: postId + '.mp3'
                    }).promise();
                })
                .then((data) => {
                    console.log(data);
                    return s3.getBucketLocation({
                        Bucket: process.env.BUCKET_NAME
                    }).promise();
                })
                .then((location) => {
                    console.log(location);
                    var region = location.LocationConstraint;
                    var urlBegining;
                    if (region) {
                        urlBegining = `https://s3-${region}.amazonaws.com`;
                    } else {
                        urlBegining = 'https://s3.amazonaws.com';
                    }
                    var url = `${urlBegining}${process.env.BUCKET_NAME}/${postId}.mp3`;
                    return docClient.updateItem({
                        Key: {
                            TableName: process.env.DB_TABLE_NAME,
                            id: postId
                        },
                        UpdateExpression: 'SET #statusAtt = :statusValue, #urlAtt = :urlValue',
                        ExpressionAttributeValues: {
                            ':statusValue': 'UPDATED', ':urlValue': url
                        },
                        ExpressionAttributeNames: {
                            '#statusAtt': 'status', '#urlAtt': 'url'
                        }
                    }).promise();
                })
                .catch((err) => {
                    console.log(err, err.stack);
                    reject(err);
                });
            });
            resolve();
        })
        .catch((err) => {
            console.error(err, err.stack);
            reject(err);
        })
    });

};

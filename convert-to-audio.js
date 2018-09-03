const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const polly = new AWS.Polly();
const s3 = new AWS.S3();
const path = require('path');
const fs = require('fs');

AWS.config.setPromisesDependency(null);

module.exports.handler = function (event, context, callback) {
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

    docClient.query(queryParam, function(err, queryResult) {
        if (err) {
            callback(err);
        } else {
            console.log('queryResult', JSON.stringify(queryResult, null, 2));

            var text = queryResult.Items[0].text;
            var voice = queryResult.Items[0].voice;

            // Because single invocation of the polly synthesize_speech api can
            // transform text with about 1,500 characters, we are dividing the
            // post into blocks of approximately 1,000 characters.

            console.log(`text: ${text}, voice: ${voice}`);

            var textBlocks = text.match(/.{1,1000}/g);
            textBlocks.forEach(block => {
                polly.synthesizeSpeech({
                    Text: text,
                    VoiceId: voice,
                    OutputFormat: 'mp3'
                }, function(err, audio) {
                    if (err) {
                        callback(err);
                    } else {
                        // Save the audio stream returned by Amazon Polly on Lambda's temp
                        // directory. If there are multiple text blocks, the audio stream
                        // will be combined into a single file.
                        var tempFile = path.join('/tmp', postId);
                        if (audio.AudioStream instanceof Buffer) {
                            console.log(`tempFile: ${tempFile}`);
                            fs.writeFileSync(tempFile, audio.AudioStream);
                            fs.readFile(tempFile, null, function (err, audioData) {
                                if (err) {
                                    callback(err);
                                } else {
                                    var uploadParams = {
                                        Bucket: process.env.BUCKET_NAME,
                                        Body: audioData,
                                        Key: postId + '.mp3'
                                    };
                                    s3.putObject(uploadParams, function(err, data) {
                                        if (err) {
                                            callback(err);
                                        } else {
                                            console.log('data', JSON.stringify(data, null, 2));
                                            s3.putObjectAcl({
                                                Bucket: process.env.BUCKET_NAME,
                                                ACL: 'public-read',
                                                Key: postId + '.mp3'
                                            }, function(err, data) {
                                                if (err) {
                                                    callback(err);
                                                } else {
                                                    s3.getBucketLocation({
                                                        Bucket: process.env.BUCKET_NAME
                                                    }, function(err, location) {
                                                        if (err) {
                                                            callback(err);
                                                        } else {
                                                            console.log('location', JSON.stringify(location, null, 2));
                                                            var region = location.LocationConstraint;
                                                            console.log(`region: ${region}`);
                                                            var urlBegining;
                                                            if (region) {
                                                                urlBegining = `https://s3-${region}.amazonaws.com`;
                                                            } else {
                                                                urlBegining = 'https://s3.amazonaws.com';
                                                            }
                                                            var url = `${urlBegining}/${process.env.BUCKET_NAME}/${postId}.mp3`;
                                                            console.log(`url: ${url}`);
                                                            docClient.update({
                                                                TableName: process.env.DB_TABLE_NAME,
                                                                Key: {
                                                                  'id': postId
                                                                },
                                                                UpdateExpression: 'SET #statusAtt = :statusValue, #urlAtt = :urlValue',
                                                                ExpressionAttributeValues: {
                                                                    ':statusValue': 'UPDATED', ':urlValue': url
                                                                },
                                                                ExpressionAttributeNames: {
                                                                    '#statusAtt': 'status', '#urlAtt': 'url'
                                                                }
                                                            }, function(err, res) {
                                                                if (err) {
                                                                    callback(err);
                                                                } else {
                                                                    callback(null, res);
                                                                }
                                                            });
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        } else {
                            callback('AudioStream is not buffer');
                        }
                    }
                });
            });
        }
    });

};

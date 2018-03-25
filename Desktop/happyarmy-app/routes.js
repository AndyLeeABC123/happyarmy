var dbOperations = require('./db-operations');

function initialize(app, db, socket, io) {
    // '/helpers?lat=12.9718915&&lng=77.64115449999997'
    app.get('/helpers', function(req, res) {
        /*
            extract the latitude and longitude info from the request. 
            Then, fetch the nearest helpers using MongoDB's geospatial queries and return it back to the client.
        */
        var latitude = Number(req.query.lat);
        var longitude = Number(req.query.lng);
        dbOperations.fetchNearestHelpers(db, [longitude, latitude], function(results) {
            res.json({
                helpers: results
            });
        });
    });

    // '/helpers/info?userId=01'
    app.get('/helpers/info', function(req, res) {
        var userId = req.query.userId //extract userId from quert params
        dbOperations.fetchHelperDetails(db, userId, function(results) {
            res.json({
                helperDetails: results
            });
        });
    });

    //Listen to a 'request-for-help' event from connected clients
    socket.on('request-for-help', function(eventData) {
        /*
            eventData contains userId and location
            1. First save the request details inside a table requestsData
            2. AFTER saving, fetch nearby helpers from client’s location
            3. Fire a request-for-help event to each of the helper’s room
        */

        var requestTime = new Date(); //Time of the request

        var ObjectID = require('mongodb').ObjectID;
        var requestId = new ObjectID; //Generate unique ID for the request

        //1. First save the request details inside a table requestsData.
        //Convert latitude and longitude to [longitude, latitude]
        var location = {
            coordinates: [
                eventData.location.longitude, 
                eventData.location.latitude
            ],
            address: eventData.location.address
        };
        dbOperations.saveRequest(db, requestId, requestTime, location, eventData.clientId, 'waiting', function(results) {

            //2. AFTER saving, fetch nearby helpers from client’s location
            dbOperations.fetchNearestHelpers(db, location.coordinates, function(results) {
                eventData.requestId = requestId;
                //3. After fetching nearest helpers, fire a 'request-for-help' event to each of them
                for (var i = 0; i < results.length; i++) {
                    io.sockets.in(results[i].userId).emit('request-for-help', eventData);
                }
            });
        });
    });

    socket.on('request-accepted', function(eventData) { //Listen to a 'request-accepted' event from connected helpers
        console.log(eventData);
        //Convert string to MongoDb's ObjectId data-type
        var ObjectID = require('mongodb').ObjectID;
        var requestId = new ObjectID(eventData.requestDetails.requestId);

        //Then update the request in the database with the helper details for given requestId
        dbOperations.updateRequest(db, requestId, eventData.helperDetails.helperId, 'engaged', function(results) {
            //After updating the request, emit a 'request-accepted' event to the client and send helper details
            io.sockets.in(eventData.requestDetails.clientId).emit('request-accepted', eventData.helperDetails);
        })

    });

    //Fetch all requests
    app.get('/requests/info', function(req, res) {
        dbOperations.fetchRequests(db, function(results) {
            var features = [];
            for (var i = 0; i < results.length; i++) {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: results[i].location.coordinates
                    },
                    properties: {
                        status: results[i].status,
                        requestTime: results[i].requestTime,
                        address: results[i].location.address
                    }
                })
            }
            var geoJsonData = {
                type: 'FeatureCollection',
                features: features
            }

            res.json(geoJsonData);
        });
    });

}

exports.initialize = initialize;
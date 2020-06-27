const http = require('http');
const express = require("express");
const cors = require('cors');
const bodyParser = require("body-parser");
const app = express();
app.use(cors({ origin: '*:*' }));



const server = http.createServer(app);
const io = require('socket.io').listen(server);
io.origins('*:*');
const admin = require("firebase-admin");
const { Client, Status } = require("@googlemaps/google-maps-services-js");
const client = new Client({});
coursiers = [];
clients = [];
courses = [];

var serviceAccount = require("./serviceAccountKey.json");

var defaultApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://poised-elf-271018.firebaseio.com"
})

console.log(defaultApp.name);  // '[DEFAULT]'

var firebaseInstance = require('./functions/firebase');
var mapInstance = require('./functions/map');
// Retrieve services via the defaultApp variable...

var defaultFirestore = defaultApp.firestore();
var defaulFCM = defaultApp.messaging();


var firebase = new firebaseInstance(defaultFirestore, defaulFCM);
var map = new mapInstance(client);


function calculerPrix(distance, poids, valeur, isFragile) {
    return new Promise((resolve, reject) => {
        firebase.getOne('tarifPoids', poids).then(
            res => {
                console.log
                firebase.getAll('tarifs').then(
                    res2 => {
                        tarifPoids = res.valeur;
                        tarifAssurance = res2[0].data.valeur;
                        tarifDistance = res2[1].data.valeur / 1000;
                        tarifFragilete = res2[2].data.valeur;
                        let prix = 0;
                        console.log(distance);
                        console.log(tarifDistance);
                        console.log(tarifPoids);
                        prix = distance * tarifDistance + tarifPoids;
                        resolve(Math.round(prix));
                    }
                ).catch(err => reject(err));
            }
        )
    });
}

function callCoursier(livraisonId) {
    firebase.getOne('livraisons', livraisonId).then(
        (livraison) => {
            map.searchNearFrom(livraison.depart, livraison.destination, coursiers).then(
                (coursier) => {
                    console.log('coursier: ', coursier);
                    if (coursier) {
                        map.calculDistanceMatrix(coursier, livraison.depart).then(
                            (res2) => {
                                let matrix = res2.data.routes[0].legs[0];
                                console.log(matrix);
                                livraison.distanceCoursierClient = matrix.distance;
                                livraison.dureeCoursierClient = matrix.duration;
                                let message = "Distance de course: " + livraison.distance.text + "\nDepart: " + matrix.start_address + "\nArrivee: " + matrix.end_address + "\nDistance p/r au client: "
                                    + matrix.distance.text;
                                let notification = {
                                    title: "TOTO Express",
                                    subtitle: "Livraison",
                                    body: message,
                                    sound: "call.mp3"
                                },
                                    data = {
                                        event: "livraison:call",
                                        title: "TOTO Express",
                                        subtitle: "Livraison",
                                        id: livraisonId,
                                        distance: livraison.distance.text,
                                        distanceClient: matrix.distance.text,
                                        dureeClient: matrix.duration.text,
                                        depart: matrix.start_address,
                                        destination: matrix.end_address,
                                        duree: matrix.duration.text,
                                        chrono: matrix.duration.value.toString()
                                    };
                                firebase.sendNotification(coursier.fcmKey, notification, data, 60);
                                firebase.update('livraisons', livraisonId, { distanceCoursierClient: matrix.distance, dureeCoursierClient: matrix.duration })
                                // io.to(coursier.socketId).emit('livraison:call', socket.livraison);
                            }
                        );
                    } else {
                        // firebase.sendNotification()
                    }

                }
            ).catch(err => {
                let notification = {
                    title: "TOTO Express",
                    subtitle: "Livraison",
                    body: 'L\'opération a échoué; veuillez reessayer!'
                },
                    data = {
                        event: "livraison:call"
                    };
                firebase.sendNotification(res.clientFcmKey, notification, data, 60 * 60);
                console.log(err);
            });
            let notification = {
                title: "TOTO Express",
                subtitle: "Livraison",
                body: 'Nous sommes a la recherche du coursier le plus proche de vous. Veuillez patientez!'
            },
                data = {
                    event: "livraison:call",
                };
            firebase.sendNotification(livraison.clientFcmKey, notification, data, 60 * 60);
        }
    ).catch(err => console.log(err))
}


// firebase.getAll('positions');
// firebase.save('test', {id: 1});

// 
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.route('/payement').post(function (req, res) {
    console.log(req.body);
    payload = req.body;
    firebase.update('livraisons', payload.identifier, { status: 4, payement: payload.amount, payed_at: payload.datetime, payementMethod: payload.payment_method, payedContact: payload.phone_number });
    callCoursier(payload.identifier);
});
const https = require('https');

function smsTo(phoneNumber, message) {
    https.get('https://api.paasoo.com/json?key=mm1evcai&secret=Q85Ztp4m&from=TT+Express&to=00228' + phoneNumber + '&text=' + message, (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            console.log(JSON.parse(data));
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}


// smsTo(92942601, "Hello world!");

io.on('connection', socket => {
    console.log(socket.id);

    socket.on('location', (res) => {
        console.log(res);
        res.socketId = socket.id;
        let i = clients.findIndex(item => item.id === res.id);
        if (i === -1) {
            clients.push(res);
            firebase.update('clients', res.id, { isOnline: true, connectionSince: new Date() });
            // sendNotification(position.id, "Vous etes desormais en liste pour recevoir les appels");
        } else {
            clients[i] = res;
        }
        io.emit('location', clients);

    });

    socket.on('position', (res) => {
        console.log(res);
        res.socketId = socket.id;
        let i = coursiers.findIndex(item => item.id === res.id);
        if (i === -1) {
            coursiers.push(res);
            firebase.update('coursiers', res.id, { isOnline: true, connectionSince: new Date() });
            // sendNotification(position.id, "Vous etes desormais en liste pour recevoir les appels");
        } else {
            coursiers[i] = res;
        }
        io.emit('position', coursiers);
    });

    socket.on('position:stop', (res) => {
        console.log(res);
        let i = coursiers.findIndex(coursier => coursier.id === res.id);
        if (i != -1) coursiers.splice(i, 1);
        // this.firebase.sendNotification()
    });

    socket.on('livraison:start', (res) => {
        console.log(res);
        map.calculDistanceMatrix(res.depart, res.destination).then(
            (res2) => {
                let matrix = res2.data.routes[0].legs[0];
                res.distance = matrix.distance;
                res.duree = matrix.duration;
                calculerPrix(res.distance.value, res.poidsId, res.valeur, res.isFragile).then(
                    prix => {
                        res.prix = prix;
                        res.createdAt = new Date();
                        res.status = 5;
                        firebase.save('livraisons', res).then(
                            id => {
                                let message = "La distance à parcourir a été évaluée à " + res.distance.text + ". Le prix provisoire est estimé à " + res.prix + ' f cfa. Nous vous rappelons \
                                que ce prix peut changer toute fois si les informations que vous avez fournies ne sont pas correctes. Veuillez confirmer pour continuer l\'operation';
                                let notification = {
                                    title: "TOTO Express",
                                    subtitle: "Livraison",
                                    body: message
                                };
                                let data = {
                                    event: "livraison:start",
                                    id: id,
                                    nom: " livraison",
                                    prix: prix.toString(),
                                    distance: matrix.distance.text,
                                    duree: matrix.duration.text
                                };
                                firebase.sendNotification(res.clientFcmKey, notification, data, 60 * 60);
                            }
                        ).catch(err => console.log(err));
                    }
                ).catch(err => console.log(err));
            }
        ).catch(err => {
            console.log(err)
            socket.emit('livraison:start', { infos: { type: 'danger', message: 'Lopération a échoué; veuillez reessayer !' } })
        });
    });

    // socket.on('livraison:call', (res) => {
    //     console.log(res);
    //     firebase.update('livraisons', res.livraisonId, { status: 4, confirmedAt: new Date() }).then(
    //         () => {
    //             if (res.response) {
    //                 firebase.getOne('livraisons', res.livraisonId).then(
    //                     (livraison) => {
    //                         map.searchNearFrom(livraison.depart, livraison.destination, coursiers).then(
    //                             (coursier) => {
    //                                 console.log('coursier: ', coursier);
    //                                 if (coursier) {
    //                                     map.calculDistanceMatrix(coursier, livraison.depart).then(
    //                                         (res2) => {
    //                                             let matrix = res2.data.routes[0].legs[0];
    //                                             console.log(matrix);
    //                                             livraison.distanceCoursierClient = matrix.distance;
    //                                             livraison.dureeCoursierClient = matrix.duration;
    //                                             let message = "Distance de course: " + livraison.distance.text + "\nDepart: " + matrix.start_address + "\nArrivee: " + matrix.end_address + "\nDistance p/r au client: "
    //                                                 + matrix.distance.text;
    //                                             let notification = {
    //                                                 title: "TOTO Express",
    //                                                 subtitle: "Livraison",
    //                                                 body: message,
    //                                                 sound: "call.mp3"
    //                                             },
    //                                                 data = {
    //                                                     event: "livraison:call",
    //                                                     title: "TOTO Express",
    //                                                     subtitNle: "Livraison",
    //                                                     id: res.livraisonId,
    //                                                     distance: livraison.distance.text,
    //                                                     distanceClient: matrix.distance.text,
    //                                                     dureeClient: matrix.duration.text,
    //                                                     depart: matrix.start_address,
    //                                                     destination: matrix.end_address,
    //                                                     duree: matrix.duration.text,
    //                                                     chrono: matrix.duration.value.toString()
    //                                                 };
    //                                             firebase.sendNotification(coursier.fcmKey, notification, data, 60);
    //                                             firebase.update('livraisons', res.livraisonId, { distanceCoursierClient: matrix.distance, dureeCoursierClient: matrix.duration })
    //                                             // io.to(coursier.socketId).emit('livraison:call', socket.livraison);
    //                                         }
    //                                     );
    //                                 } else {
    //                                     // firebase.sendNotification()
    //                                 }

    //                             }
    //                         ).catch(err => {
    //                             let notification = {
    //                                 title: "TOTO Express",
    //                                 subtitle: "Livraison",
    //                                 body: 'L\'opération a échoué; veuillez reessayer!'
    //                             },
    //                                 data = {
    //                                     event: "livraison:call"
    //                                 };
    //                             firebase.sendNotification(res.clientFcmKey, notification, data, 60 * 60);
    //                             console.log(err);
    //                         });
    //                         let notification = {
    //                             title: "TOTO Express",
    //                             subtitle: "Livraison",
    //                             body: 'Nous sommes a la recherche du coursier le plus proche de vous. Veuillez patientez!'
    //                         },
    //                             data = {
    //                                 event: "livraison:call",
    //                             };
    //                         firebase.sendNotification(livraison.clientFcmKey, notification, data, 60 * 60);
    //                     }
    //                 ).catch(err => console.log(err))
    //             }
    //         }
    //     );

    // });

    socket.on('livraison:response', (res) => {
        console.log(res);
        if (res.response) {
            // socket.livraison = { id: res.livraisonId, clientId: res.clientId, status: 3, clientFcmKey: res.clientFcmKey };
            firebase.getOne('livraisons', res.livraisonId).then(
                livraison => {
                    livraison.status = 3;
                    livraison.acceptedCall = new Date();
                    livraison.coursierId = res.coursierId;
                    livraison.coursierFcmKey = res.coursierFcmKey;
                    firebase.update('livraisons', res.livraisonId, livraison).then(
                        () => {
                            let message = "Un coursier arrivera dans " + livraison.dureeCoursierClient.text + " pour recuperer votre coli. Veuillez vous assurer que vous etes toujopurs joignable."
                            let notification = {
                                title: "TOTO Express",
                                subtitle: "Livraison",
                                body: message
                            },
                                data = {
                                    event: "livraison:response",
                                    duree: livraison.dureeCoursierClient.text
                                };
                            firebase.sendNotification(livraison.clientFcmKey, notification, data, 60 * 60);
                        }
                    ).catch(err => console.log(err));
                }
            );

        } else {
            console.log('cancelled call!');
        }
    });

    socket.on('livraison:abandon', (res) => {
        console.log(res);
        // map.searchNearFrom(res.depart, res.destination).then(
        //     (data) => {
        //         socket.emit('livraison:call', {infos:{type:'success', message:'Votre commande a été bien enregistré!', data: data}});
        //     }

        // ).cacth(err =>  socket.emit('livraison:call', {infos:{type:'success', message:'Lopération a échoué; veuillez reessayer !'}}) );
    });

    socket.on('livraison:correction', (res) => {
        console.log(res);
        // map.searchNearFrom(res.depart, res.destination).then(
        //     (data) => {
        //         socket.emit('livraison:call', {infos:{type:'success', message:'Votre commande a été bien enregistré!', data: data}});
        //     }

        // ).cacth(err =>  socket.emit('livraison:call', {infos:{type:'success', message:'Lopération a échoué; veuillez reessayer !'}}) );
    });

    socket.on('livraison:validation', (res) => {
        console.log(res);
        // let course = courses.find(item => item.livraisonId === res.livraisonId);
        firebase.getOne('livraisons', res.livraisonId).then(
            (course) => {
                if (course) {
                    let message = "Vos informations ont été validées, veuillez confirmez pour proceder au paiement.";
                    let notification = {
                        title: "TOTO Express",
                        subtitle: "Confirmation",
                        body: message
                    },
                        data = {
                            event: "livraison:validation",
                            montant: course.prix.toString(),
                            id: res.livraisonId,
                            message: message
                        };
                    firebase.sendNotification(course.clientFcmKey, notification, data, 60 * 60);

                    let message2 = "En attente de paiement. Veuillez attendre le message de confirmation!",
                        notification2 = {
                            title: "TOTO Express",
                            subtitle: "Confirmation",
                            body: message2
                        },
                        data2 = {
                            event: "livraison:validation",
                            montant: course.prix.toString(),
                            id: res.livraisonId,
                            message: message2
                        };


                    firebase.sendNotification(course.coursierFcmKey, notification2, data2, 60 * 60);
                } else {
                    let message = "Cette course a été revoqué. Le client doit reprendre le processus!";
                    let notification = {
                        title: "TOTO Express",
                        subtitle: "Confirmation",
                        body: message,
                        id: res.livraisonId
                    },
                        data = {
                            event: "livraison:validation",
                            message: message,
                            id: res.livraisonId
                        };
                    firebase.sendNotification(course.coursierFcmKey, notification, data, 60 * 60);
                    firebase.sendNotification(course.clientFcmKey, notification, data, 60 * 60);
                }

            }
        );

    });

    socket.on('livraison:end', (res) => {
        console.log(res);
        firebase.getOne('livraisons', res.livraisonId).then(
            (livraison) => {
                livraison.status = 1;
                firebase.update('livraisons', res.livraisonId, livraison);
                let message = "La livraison a été effectué avec success.";
                let notification = {
                    title: "TOTO Express",
                    subtitle: "Confirmation",
                    body: message
                },
                    data = {
                        event: "livraison:end",
                        id: res.livraisonId,
                        message: message
                    };
                firebase.sendNotification(livraison.coursierFcmKey, notification, data, 60 * 60);
                firebase.sendNotification(livraison.clientFcmKey, notification, data, 60 * 60 * 24);
            });
        // map.searchNearFrom(res.depart, res.destination).then(
        //     (data) => {
        //         socket.emit('livraison:call', {infos:{type:'success', message:'Votre commande a été bien enregistré!', data: data}});
        //     }

        // ).cacth(err =>  socket.emit('livraison:call', {infos:{type:'success', message:'Lopération a échoué; veuillez reessayer !'}}) );
    });

    socket.on('disconnect', () => {
        console.log('disconnected ' + socket.id + ' & ' + socket.fcmKey)
        let i = coursiers.findIndex(coursier => coursier.socketId === socket.id);
        if (i != -1) {
            firebase.update('coursiers', coursiers[i].id, { isOnline: false, connectionSince: new Date() });
            coursiers.splice(i, 1);
        }
        let j = clients.findIndex(client => client.socketId === socket.id);
        if (j != -1) {
            firebase.update('clients', clients[j].id, { isOnline: false, connectionSince: new Date() });
            clients.splice(j, 1);
        }
    });

});

server.listen(3000);
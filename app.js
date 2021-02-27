'use strict';

const http = require('http');
const express = require("express");
const cors = require('cors');
const bodyParser = require("body-parser");
const app = express();
app.set('view engine', 'pug');
// app.use(cors({ origin: '*:*' }));
var corsOptions = {
    origin: 'http://example.com',
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
var pingInterval = 25 * 1000;
// https://poised-elf-271018.appspot.com/payement

const server = http.Server(app);
const io = require('socket.io')(server, { 'pingInterval': pingInterval });
const admin = require("firebase-admin");
const { Client, Status } = require("@googlemaps/google-maps-services-js");
const client = new Client({});
var coursiers = [];
var exceptions = [];
var clients = [];

var serviceAccount = require("./serviceAccountKey.json");

var defaultApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://poised-elf-271018.firebaseio.com"
})

console.log(defaultApp.name); // '[DEFAULT]'

var firebaseInstance = require('./functions/firebase');
var mapInstance = require('./functions/map');
// Retrieve services via the defaultApp variable...

var defaultFirestore = defaultApp.firestore();
var defaulFCM = defaultApp.messaging();


var firebase = new firebaseInstance(defaultFirestore, defaulFCM);
var map = new mapInstance(client);


function calculerPrix(poids, distance, categorie, valeur, fragilite) {
    distance /= 1000;
    // let callback = function(ref) {
    //     ref.where('borneInf', '>=', distance).where('borneSup', '<', distance)
    // }
    return firebase.getInCollection('poids', poids, 'tarifs').then(
        res => {
            let tarif = res.find(item => item.data.borneInf < distance && item.data.borneSup >= distance)
            console.log(tarif);
            return Math.round(tarif.data.montant * distance);
        }
    )
}

function callCoursier(livraisonId, coursierId) {
    firebase.getOne('livraisons', livraisonId).then(
        (livraison) => {
            if (!coursierId) {
                console.log(coursiers);
                map.searchNearFrom(livraison.data.trajet.depart, livraison.data.trajet.destination, coursiers).then(
                    (coursier) => {
                        console.log('coursier: ', coursier);
                        if (coursier) {
                            map.calculDistanceMatrix(coursier, livraison.data.trajet.depart).then(
                                (res2) => {
                                    let matrix = res2.data.routes[0].legs[0];
                                    let message = "Distance de course: " + livraison.data.trajet.distance.text + "\nDepart: " + matrix.start_address + "\nArrivee: " + matrix.end_address + "\nDistance p/r au client: " +
                                        matrix.distance.text;
                                    let notification = {
                                            title: "T-Link",
                                            subtitle: "Appel entrant",
                                            body: message,
                                            sound: "call.mp3"
                                        },
                                        data = {
                                            type: "livraison",
                                            action: "call",
                                            livraisonId,
                                            message
                                        };
                                    firebase.sendNotification(coursier.fcmKey, notification, data, 60);
                                    // io.to(coursier.socketId).emit('livraison:call', socket.livraison);
                                }
                            );
                        } else {
                            // firebase.sendNotification()
                            console.log('pas de coursier');
                        }

                    }
                ).catch(err => {
                    // let notification = {
                    //     title: "TOTO Express",
                    //     subtitle: "Livraison",
                    //     body: 'L\'opération a échoué; veuillez reessayer!'
                    // },
                    //     data = {
                    //         event: "livraison:call"
                    //     };
                    // firebase.sendNotification(res.data.clientFcmKey, notification, data, 60 * 60);
                    console.log(err);
                });
            } else {
                let coursier = coursiers.find(coursier => coursier.id === coursierId);
                console.log('coursier en ligne: ', coursier);
                if (coursier) {
                    map.calculDistanceMatrix(coursier, livraison.data.trajet.depart).then(
                        (res2) => {
                            let matrix = res2.data.routes[0].legs[0];
                            console.log(matrix);
                            let message = "Distance de course: " + livraison.data.trajet.distance.text + "\nDepart: " + matrix.start_address + "\nArrivee: " + matrix.end_address + "\nDistance p/r au client: " +
                                matrix.distance.text;
                            let notification = {
                                    title: "T-Link",
                                    subtitle: "Appel entrant",
                                    body: message,
                                    sound: "call.mp3"
                                },
                                data = {
                                    type: "livraison",
                                    action: "call",
                                    livraisonId,
                                    message
                                };
                            firebase.sendNotification(coursier.fcmKey, notification, data, 60);
                            // io.to(coursier.socketId).emit('livraison:call', socket.livraison);
                        }
                    );
                } else {
                    // firebase.sendNotification()
                    console.log('coursier hors ligne');
                }
            }

        }
    ).catch(err => console.log(err))
}

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

// firebase.getAll('positions');
// firebase.save('test', {id: 1});

// 
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.route('/').get(function(req, res) {
    res.send('hello world Aromestr!');
});

app.route('/coursier/add').post(function(req, ans) {
    var res = req.body;
    console.log(res);
    let randPass = '';
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < 6; i++) randPass += possible.charAt(Math.floor(Math.random() * possible.length));
    console.log(randPass);
    admin.auth().createUser({ email: res.email, password: randPass, phoneNumber: res.phoneNumber, photoURL: res.photoURL, displayName: res.nom + ' ' + res.prenom }).then(
        (data) => {
            firebase.set('coursiers', data.uid, res).then(
                () => ans.send({ response: 'ok', password: randPass })
            );
        }
    )
});

//payement paygate
app.route('/payement').post(function(req, res) {
    res.send({ response: 'ok' });
    var payload = req.body;
    console.log(payload);
    firebase.getOne('transactions', payload.identifier).then(
        transaction => {
            // firebase.update('livraisons', payload.identifier, { status: 4, payement: payload.amount, payed_at: payload.datetime, payementMethod: payload.payment_method, payedContact: payload.phone_number });
            if (transaction.data.type === 'payement') {
                defaultFirestore.collection('livraisons')
                    .where('client.id', '==', transaction.data.userId)
                    .where('payement.transactionId', '==', transaction.id)
                    .get().then(
                        (res) => {
                            let array = [];
                            res.forEach(item => {
                                const id = item.id;
                                const data = item.data();
                                array.push({ id: id, data: data });
                            });
                            console.log(array);
                            if (array.length > 0) {
                                let livraison = array[0];
                                if (livraison.data.payement.prix === payload.amount) {
                                    if (payload.payment_method === 'PORTEFEUILLE') {
                                        firebase.getOne('clients', livraison.data.client.id).then(
                                            client => {
                                                if (client.data.solde >= livraison.data.payement.prix) {
                                                    firebase.update('clients', client.id, { solde: client.data.solde - livraison.data.payement.prix }).then(
                                                        () => {
                                                            firebase.update('livraisons', livraison.id, { status: 2 }).then(
                                                                () => {
                                                                    firebase.update('transactions', transaction.id, { status: 2, payedAt: payload.datetime, methode: payload.payment_method, reference: payload.payment_reference });
                                                                    let message = "Votre payement a été accepté. Nous sommes entrain de contacter le coursier le plus proche de vous. Vous aurez un retour dans les secondes suivantes.";
                                                                    let notification = {
                                                                        title: "T-Link",
                                                                        subtitle: "Notification",
                                                                        body: message
                                                                    };
                                                                    let data = {
                                                                        id: livraison.id,
                                                                        type: "payement",
                                                                        action: "information",
                                                                        message: message
                                                                    };
                                                                    firebase.saveInCollection('livraisons', livraison.id, 'discussions', { senderId: "1", message: { texte: message }, createdAt: new Date() });
                                                                    firebase.sendNotification(livraison.data.client.fcmKey, notification, data, 60 * 60);
                                                                    callCoursier(livraison.id);
                                                                }
                                                            );
                                                        }
                                                    );
                                                } else {
                                                    console.log('solde insuffisant!');
                                                }
                                            }
                                        )
                                    } else {
                                        firebase.update('livraisons', livraison.id, { status: 2 }).then(
                                            () => {
                                                firebase.update('transactions', transaction.id, { status: 2, payedAt: payload.datetime, methode: payload.payment_method, reference: payload.payment_reference });
                                                let message = "Votre payement a été accepté. Nous sommes entrain de contacter le coursier le plus proche de vous. Vous aurez un retour dans les secondes suivantes.";
                                                let notification = {
                                                    title: "T-Link",
                                                    subtitle: "Notification",
                                                    body: message
                                                };
                                                let data = {
                                                    id: livraison.id,
                                                    type: "payement",
                                                    action: "information",
                                                    message: message
                                                };
                                                firebase.saveInCollection('livraisons', livraison.id, 'discussions', { senderId: "1", message: { texte: message }, createdAt: new Date() });
                                                firebase.sendNotification(livraison.data.client.fcmKey, notification, data, 60 * 60);
                                                callCoursier(livraison.id);
                                            }
                                        );
                                    }

                                } else {
                                    // add to portefeuille
                                    console.log('Bad transaction solde');
                                    // send to message
                                }
                            } else {
                                console.log('transaction non trouvée!');
                            }
                        }
                    ).catch(err => console.log('error: ', err));
            } else if (transaction.data.type === 'depot') {
                if (transaction.data.montant === payload.amount) {
                    firebase.getOne('clients', transaction.data.userId).then(
                        client => {
                            firebase.update('clients', transaction.data.userId, { solde: client.data.solde + payload.amount }).then(
                                () => {
                                    firebase.update('transactions', transaction.id, { status: 2, payedAt: payload.datetime, methode: payload.payment_method, reference: payload.payment_reference }).then(
                                        () => {
                                            let message = "Votre payement a été accepté. Votre compte est rechargé.";
                                            let notification = {
                                                title: "T-Link",
                                                subtitle: "Notification",
                                                body: message
                                            };
                                            let data = {
                                                id: transaction.id,
                                                type: "payement",
                                                action: "information",
                                                message: message
                                            };
                                            firebase.sendNotification(client.data.fcmKey, notification, data, 60 * 60);
                                        }
                                    );
                                }
                            );
                        }
                    );

                } else {
                    console.log('Bad transaction solde');
                }

            }
        }
    );
});

//livraisons
const https = require('https');
app.route('/livraison/calculate').post(function(req, ans) {
    ans.send({ response: 'ok' });
    console.log(req.body);
    var res = req.body;
    map.calculDistanceMatrix(res.trajet.depart, res.trajet.destination).then(
        (res2) => {
            let matrix = res2.data.routes[0].legs[0];
            res.trajet.distance = matrix.distance;
            res.trajet.duree = matrix.duration;
            calculerPrix(res.colis.poidsId, matrix.distance.value, res.colis.categorieId, res.colis.valeur, res.colis.fragilite).then(
                prix => {
                    console.log('calcul prix :', prix);
                    let message = "La distance à parcourir a été évaluée à " + matrix.distance.text + ". Le prix provisoire est estimé à " + prix + ' f cfa. Nous vous rappelons \
                    que ce prix peut changer toute fois si les informations que vous avez fournies ne sont pas correctes. Veuillez effectuer le payement pour continuer l\'opération';
                    firebase.save('transactions', { methode: null, montant: prix, beneficiaire: 'TOTO Africa', type: 'payement', userId: res.client.id, phoneNumber: null, status: 1, description: message }).then(
                        transactionId => {
                            res.payement = { prix, transactionId };
                            res.status = 1;
                            firebase.save('livraisons', res).then(
                                id => {

                                    let notification = {
                                        title: "TOTO Express",
                                        subtitle: "Livraison",
                                        body: message
                                    };
                                    let data = {
                                        type: "livraison",
                                        action: "payement",
                                        message,
                                        transactionId,
                                        id
                                    };
                                    firebase.sendNotification(res.client.fcmKey, notification, data, 60 * 60);
                                }
                            ).catch(err => console.log(err));

                        }
                    );

                }
            ).catch(err => console.log(err));
        }
    ).catch(err => {
        console.log(err)
    });
});

app.route('/livraison/call').post(function(req, ans) {
    ans.send({ response: 'ok' });
    var res = req.body;
    console.log(res);
    callCoursier(res.livraisonId, res.coursierId)
});

app.route('/livraison/accept').post(function(req, ans) {
    var res = req.body;
    console.log(res);
    if (res.accept) {
        let coursier = coursiers.find(item => item.id = res.coursierId);
        if (coursier) {
            firebase.getOne('livraisons', res.livraisonId).then(
                livraison => {
                    map.calculDistanceMatrix(coursier, livraison.data.trajet.depart).then(
                        (res2) => {
                            let matrix = res2.data.routes[0].legs[0];
                            console.log(matrix);
                            let message = "Le coursier le plus proche de vous se trouve à " + matrix.distance.text + " de vous. Il arrivera dans environ " + matrix.duration.text + ". Il vous contactera à son arrivée. Veuillez garder votre téléphone allumé.";
                            let notification = {
                                    title: "T-Link",
                                    subtitle: "Coursier en route",
                                    body: message
                                },
                                data = {
                                    type: "livraison",
                                    action: "information",
                                    livraisonId: livraison.id,
                                    message
                                };
                            firebase.sendNotification(livraison.data.client.fcmKey, notification, data, 60);
                            firebase.saveInCollection('livraisons', livraison.id, 'discussions', { senderId: "1", message: { texte: message }, createdAt: new Date() });
                            firebase.getOne('coursiers', res.coursierId).then(
                                coursier2 => {
                                    firebase.update('livraisons', res.livraisonId, {
                                        coursier: { id: coursier.id, fcmKey: coursier2.data.fcmKey, nom: coursier2.data.nom, phoneNumber: coursier2.data.phoneNumber },
                                        deplacement: { createdAt: new Date(), adresse: matrix.start_address, longitude: coursier.longitude, latitude: coursier.latitude, distance: matrix.distance, duree: matrix.duration }
                                    }).then(
                                        res => {
                                            let msg = "Salut, je suis Mr " + coursier2.data.nom + " et je serais votre coursier pour cette livraison. Veuillez garder votre téléphone  près de vous et allumé. Je suis en route."
                                            firebase.saveInCollection('livraisons', livraison.id, 'discussions', { senderId: coursier2.id, type: 'coursiers', message: { texte: msg }, createdAt: new Date() });
                                            ans.send({ response: 'ok' });
                                        }).catch(err => console.log(err));
                                });
                        }
                    );

                }
            )
        } else {
            // firebase.sendNotification()
            console.log('pas de coursier');
        }



    } else {
        exceptions.push({ coursierId: res.coursierId, livraisonId: res.livraisonId });
        callCoursier(res.livraisonId);
    }

});

app.route('/livraison/arriveeClient').post(function(req, ans) {
    let res = req.body;
    console.log(res);
    firebase.update('livraisons', res.livraisonId, { status: 3, arrivedClientAt: new Date() });
    let message = "Votre coursier est arrivé!";
    let notification = {
            title: "T-Link",
            subtitle: "Coursier arrivé",
            body: message
        },
        data = {
            type: "livraison",
            action: "information",
            livraisonId: res.livraisonId,
            message
        };
    let msg = "Je suis arrivé à la localisation indiquée comme votre adresse de départ.";
    firebase.saveInCollection('livraisons', livraison.id, 'discussions', { senderId: coursier2.id, type: 'coursiers', message: { texte: msg }, createdAt: new Date() });
    firebase.sendNotification(res.clientFcmKey, notification, data, 60);
});

//validation du coli
app.route('/livraison/confirmationColi').post(function(req, ans) {
    let res = req.body;
    console.log(res);
    if (!res.accept) {
        firebase.update('livraisons', res.livraisonId, { status: 4, validatedColisAt: new Date() });
        let message = "Votre colis est validé!";
        let notification = {
                title: "T-Link",
                subtitle: "Colis validé",
                body: message
            },
            data = {
                type: "livraison",
                action: "information",
                livraisonId: res.livraisonId,
                message
            };
        firebase.saveInCollection('livraisons', livraison.id, 'discussions', { senderId: "1", message: { texte: message }, createdAt: new Date() });
        firebase.sendNotification(res.clientFcmKey, notification, data, 60);
    } else {
        //oncaluclate prix;
    }
});

app.route('/livraison/arriveeDestinataire').post(function(req, ans) {
    let res = req.body;
    console.log(res);
    firebase.update('livraisons', res.livraisonId, {
        status: 5,
        arrivedClientAt: new Date()
    });
    let message = "Votre coursier est arrivé chez le destinataire!";
    let notification = {
            title: "T-Link",
            subtitle: "Coursier arrivé",
            body: message
        },
        data = {
            type: "livraison",
            action: "information",
            livraisonId: res.livraisonId,
            message
        };
    let msg = "Je suis arrivé à la localisation indiquée comme adresse du destinataire. Je suis entrain de procéder à la décharge.";
    firebase.saveInCollection('livraisons', livraison.id, 'discussions', { senderId: coursier2.id, type: 'coursiers', message: { texte: msg }, createdAt: new Date() });
    firebase.sendNotification(res.clientFcmKey, notification, data, 60);
});

app.route('/livraison/finish').post(function(req, ans) {
    let res = req.body;
    console.log(res);
    if (res.accept) {
        firebase.getOne('livraisons', res.livraisonId).then(
            livraison => {
                firebase.update('livraisons', livraison.id, { status: 6, signature: res.signature, finishedAt: new Date() });
                let message = "Votre livraison a été effectuée avec succcess!";
                let notification = {
                        title: "T-Link",
                        subtitle: "Livraison effectué",
                        body: message
                    },
                    data = {
                        type: "livraison",
                        action: "information",
                        livraisonId: livraison.id,
                        message
                    };
                firebase.saveInCollection('livraisons', livraison.id, 'discussions', { senderId: "1", message: { texte: message }, createdAt: new Date() });
                firebase.sendNotification(livraison.data.client.fcmKey, notification, data, 60);
            }
        );

    } else {
        //signaler un incident;
    }
});

app.route('/livraison/message').post(function(req, ans) {
    let res = req.body;
    console.log(res);

    let notification = {
            title: "T-Link",
            subtitle: "Nouveau message",
            body: res.discussion.message.texte
        },
        data = {
            type: "livraison",
            action: "message",
            livraisonId: res.livraisonId,
            message: res.discussion.message.texte
        };
    res.discussion.sendedAt = new Date();
    firebase.saveInCollection('livraisons', res.livraisonId, 'discussions', res.discussion);
    firebase.getOne(res.receiverType, res.receiverId).then(
        receiver => {
            firebase.sendNotification(receiver.data.fcmKey, notification, data, 60);
        }
    );
});


io.on('connection', socket => {
    console.log(socket.id);

    function sendPing() {
        socket.emit('ping1');
    }

    setTimeout(sendPing, pingInterval);
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
                calculerPrix(res.colis.poids, res.distance.value, res.colis.categorie, res.colis.valeur, res.colis.fragilite).then(
                    prix => {
                        console.log('calcul prix :', prix);
                        res.prix = prix;
                        res.createdAt = new Date();
                        res.status = 5;
                        res.colis.imageClient = null;
                        firebase.save('livraisons', res).then(
                            id => {
                                let message = "La distance à parcourir a été évaluée à " + res.distance.text + ". Le prix provisoire est estimé à " + res.prix + ' f cfa. Nous vous rappelons \
                                que ce prix peut changer toute fois si les informations que vous avez fournies ne sont pas correctes. Veuillez effectuer le payement pour continuer l\'opération';
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
                                firebase.sendNotification(res.client.fcmKey, notification, data, 60 * 60);
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
        console.log('disconnected :', coursiers[i].id)
            // if (i != -1) {
            //     firebase.update('coursiers', coursiers[i].id, { isOnline: false, connectionSince: new Date() });
            //     coursiers.splice(i, 1);
            // }
            // let j = clients.findIndex(client => client.socketId === socket.id);
            // if (j != -1) {
            //     firebase.update('clients', clients[j].id, { isOnline: false, connectionSince: new Date() });
            //     clients.splice(j, 1);
            // }
    });

});

if (module === require.main) {
    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
        console.log(`App listening on port ${PORT}`);
        console.log('Press Ctrl+C to quit.');
    });
}
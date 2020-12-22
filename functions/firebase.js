'use strict';

module.exports = class map {
  
    constructor(firestore, FCM) {
        this.firestore = firestore;
        this.FCM = FCM;
        this.FCMKey = "AAAAyF3geqA:APA91bEIWzKgNskuWmT2ImZ8TwojEnNRAHyU3eQrpMT3zOE7YJ3osfLLSO4Simb2H_9QrV6byX88TQk60ofAXjfwLDD3O60_TKaqOZyU1WWq2ugUWizzcJ-wFuOVDzk92Mt1rXQb_vkL";

    }
    //firebase functions

    getAll(path, ref) {
        return this.firestore.collection(path).ref.get().then(
            (res) => {
                let array = [];
                res.forEach(item => {
                    const id = item.id;
                    const data = item.data();
                    array.push({ id: id, data: data });
                    // findNearDriver(data.depart.latitude, data.depart.longitude, res.data());
                });
                console.log(array.length);
                return array;
            }
        ).catch(err => console.log('error: ', err));
    }

    getOne(path, id) {
        return this.firestore.collection(path).doc(id).get().then(
            res => {
                let data = res.data();
                return {id, data};
            }
        );
    }
    getInCollection(collection, id, path) {
        return this.firestore.collection(collection).doc(id).collection(path).get().then(
            (res) => {
                let array = [];
                res.forEach(item => {
                    const id = item.id;
                    const data = item.data();
                    array.push({ id: id, data: data });
                    // findNearDriver(data.depart.latitude, data.depart.longitude, res.data());
                });
                console.log(array);
                return array;
            }
        );
    }

    save(path, data) {
        console.log('executed!!');
        data.createdAt = new Date();
      return  this.firestore.collection(path).add(data).then(
            res => {
                console.log('response: ', res.id);
                return res.id;
            }
        ).catch(err => console.log(err));
    }

    update(path, id, data) {
        console.log('executed!!');
        data.updatedAt = new Date();
        return  this.firestore.collection(path).doc(id).update(data).then(
            res => {
                console.log('response: ', res);
                return true;
            }
        ).catch(err => console.log(err));
    }



    //FCM
    sendNotification(uid, notification, data, period) {
        notification.sound=notification.sound?notification.sound:notification.sound = "default";
        const payload = {
            notification,
            data
        };
        const options = {
            priority: "high",
            timeToLive: period
            //  60 * 60 *24
          };
        this.FCM.sendToDevice(uid, payload, options).then(
            res => console.log(JSON.stringify(res))
        ).catch(err => console.log(JSON.stringify(err)));
    }

}
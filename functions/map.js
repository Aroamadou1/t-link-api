'use strict';

module.exports = class map {
    constructor(client) {
        this.client = client;
        this.key = "AIzaSyDlhMUVwp9azYQCiHxJirWeqMHE_dBYKOA";

    }

    rad(x) { return x * Math.PI / 180; }
    //googlemap functions
    calculDistanceMatrix(depart, destination) {
        const route = {
            origin: [depart.latitude, depart.longitude],
            destination: [destination.latitude, destination.longitude],
            // unitSystem: google.maps.UnitSystem.METRIC,
            travelMode: 'DRIVING',
            key: this.key
        }

        return this.client.directions({ params: route });
    }

    searchNearFrom(lat, lng, positions) {

        return new Promise((resolve, reject) => {
            let response;
            if (positions.length > 0) {
                var R = 6371; // radius of earth in km
                var distances = [];
                var closest = -1;
                for (let i = 0; i < positions.length; i++) {
                    if (positions[i].workState === 5) {
                        var mlat = positions[i].latitude;
                        var mlng = positions[i].longitude;
                        var dLat = this.rad(mlat - lat);
                        var dLong = this.rad(mlng - lng);
                        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                            Math.cos(this.rad(lat)) * Math.cos(this.rad(lat)) * Math.sin(dLong / 2) * Math.sin(dLong / 2);
                        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                        var d = R * c;
                        distances[i] = d;
                        if (closest === -1 || d < distances[closest]) {
                            closest = i;
                        }
                    }

                }
                response = positions[closest];
                resolve(response);
            } else {
                resolve(null);
            }
        })


    }

}





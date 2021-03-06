import Queueable from "../Queueable";
import MapboxGL from 'mapbox-gl';

export default class Mapbox extends Queueable {

    init(queue) {
        this.queue = queue;
        this.maps = {};
        this.overlays = {};
        this.ready = true;
    }

    /**
     * Create a new mapbox gl map
     * @param {int} pid
     * @param {object} json
     * @param {string} json.map - name for the map (used to reference)
     * @param {string} json.target - id of element in the page to target
     * @param {string} json.style - mapbox style for the map
     * @param {int} json.zoom - Set the initial zoom of the map
     * @param {array} json.center - Center on
     * @example
     * mapbox.addMap({"map": "testMap", "target":"mapboxMap", "style": "mapbox://styles/mapbox/streets-v11", "zoom": 8, "center": [-70, 41.2]});
     */
    addMap(pid,json) {
        const options = Object.assign({
            map: 'default',
            zoom: 0,
            center: [-74.5, 40],
            style: 'mapbox://styles/mapbox/streets-v11',
            target: 'map',
        }, json);

        MapboxGL.accessToken = 'pk.eyJ1IjoibmF1dG9ndWlkZWx0ZCIsImEiOiJjamx4dHQwYngwY2E1M3dxZGx1MHJoendpIn0.a6m0F2N8dJnx5yzz-OJfFQ';
        const map = new MapboxGL.Map({
            container: options.target, // container id
            style: options.style, // stylesheet location
            center: options.center, // starting position [lng, lat]
            zoom: options.zoom, // starting zoom
        });

        this.maps[options.map]={ map, layers: {} };

        map.on('load', () => {
            this.finished(pid,self.queue.DEFINE.FIN_OK);
        });
    };

    /**
     * Add a new source and layer to the map
     * @param {int} pid
     * @param {object} json
     * @param {string} json.map - name for the map (used to reference)
     * @param {string} json.name - Name for the layer/source
     * @param {string} json.featureType - The type of feature for the layer one of ['Point', 'Line', 'Polygon', 'MultiLineString']
     * @param {string|object} json.data - Set the data of the source, this could also be a url for the data
     * @example
     * mapbox.addSource({"map": "testMap", "name": "newLayer", "featureType": "Point", "data": "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_10m_ports.geojson"});
     */
    addSource(pid, json) {
        const options = Object.assign({
            map: 'default',
            data: {
                type: 'FeatureCollection',
                features: [],
            },
            type: 'FeatureCollection',
            name: 'default',
            featureType: 'Point',
            paint: {},
        }, json);

        this.maps[options.map].map.addSource(options.name, {
            type: 'geojson',
            data: options.data,
        });

        this._addLayer(options);

        this.finished(pid,self.queue.DEFINE.FIN_OK);
    }

    /**
     * Add the layer to the map once a source has been created.
     * @param {object} options
     * @param {string} options.featureType - The type of feature that the layer is.
     * @param {string} options.name - The name for the layer
     * @param {object} options.paint - The styling for the layer
     * @private
     */
    _addLayer(options) {
        const Types = {
            Point: 'circle',
            Line: 'line',
            LineString: 'line',
            Polygon: 'fill',
        };

        this.maps[options.map].map.addLayer({
            id: options.name,
            type: Types[options.featureType],
            source: options.name,
            filter: ['==', '$type', options.featureType],
            paint: options.paint,
        });

        this.maps[options.map].layers[options.name] = {
            defaultStyle: options.paint,
        }
    }

    /**
     * Set the data for a layer
     * @param {int} pid
     * @param {object} json
     * @param {string} json.map - The name of the map that the layer is on
     * @param {string} json.name - The name of the layer that the data will be set on
     * @param {object|string} json.data - The data to set the layer to (this will override old data)
     */
    setData(pid, json) {
        const options = Object.assign({
            map: 'default',
            name: 'default',
            data: {
                type: 'FeatureCollection',
                features: [],
            },
        }, json);

        this.maps[options.map].map.getSource(options.name).setData({
            ...options.data,
        });
        this.finished(pid,self.queue.DEFINE.FIN_OK);
    }

    /**
     * Set the data for a layer
     * @param {int} pid
     * @param {object} json
     * @param {string} json.map - The name of the map that the layer is on
     * @param {string} json.name - The name of the layer to clear
     */
    clearLayer(pid, json) {
        const options = Object.assign({
            map: 'default',
            name: '',
        }, json);

        this.maps[options.map].map.getSource(json.name).setData({
            type: 'FeatureCollection',
            features: [],
        });
        this.finished(pid,self.queue.DEFINE.FIN_OK);
    }

    /**
     * Zoom to the bounds of a layer
     * @param {int} pid
     * @param {object} json
     * @param {string} json.map - Name of the map the layer is within
     * @param {string} json.name - Name of the layer to zoom in to
     * @param {int} json.padding - Padding around the layer zoom
     */
    zoomToBounds(pid, json) {
        const options = Object.assign({
            map: 'default',
            name: '',
            padding: 20,
        }, json);

        let coordinates = this.maps[options.map].map.getSource(json.name)._data.features[0].geometry.coordinates;
        if(typeof coordinates[0][0] === 'object') {
            coordinates = coordinates[0]
        }
        const bounds = coordinates.reduce((bounds, coord) =>  bounds.extend(coord), new MapboxGL.LngLatBounds(coordinates[0], coordinates[0]));
        this.maps[options.map].map.fitBounds(bounds, { padding: options.padding });

        this.finished(pid,self.queue.DEFINE.FIN_OK);
    }

    /**
     * Query and highlight feature depending on the paint features
     * @param {int} pid
     * @param {object} json
     * @param {string} json.map - The map that the querying layer is on
     * @param {string} json.name - The name of the layer to query
     * @param {object} json.paint - The pain object for querying ans styling
     * @param {string} json.paint.type - The styling type that will be changed for highlighting
     * @param {array} json.paint.value - The list of paint styles for querying e.g. [["get", "feature_name"], "test_name", "#333399"] This will be appended to the current style
     */
    paintQueryFeatures(pid, json) {
        const options = Object.assign({
            map: 'default',
            name: '',
            paint: {},
        }, json);

        let paint = JSON.parse(JSON.stringify(this.maps[options.map].layers[options.name])).defaultStyle[options.paint.type];
        let final = null;
        if(typeof paint === 'object') {
            final = paint.splice([paint.length - 1], 1);
            for (let value of options.paint.value) {
                for (let i = 0; i < paint.length; i += 2) {
                    if (value === paint[i]) {
                        paint.splice(i, 2);
                    }
                }
            }
            paint = [...paint, ...options.paint.value];

            paint.push(final[0]);
        } else {
            paint = options.paint.value;
        }

        this.maps[options.map].map.setPaintProperty(options.name, options.paint.type, paint);

        this.finished(pid,self.queue.DEFINE.FIN_OK);
    }
}
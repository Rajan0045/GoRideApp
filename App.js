import Geolocation from "@react-native-community/geolocation";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, PermissionsAndroid, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { promptForEnableLocationIfNeeded } from "react-native-android-location-enabler";
import Config from "react-native-config";
import MapView, { Marker, Polyline } from "react-native-maps";

const ORS_API_KEY = Config.ORS_API_KEY;

const App = () => {
  const mapRef = useRef(null);
  const watchId = useRef(null);
  const previousLocation = useRef(null);
  const lastRouteUpdate = useRef(0);
  const headingRef = useRef(0);
  const zoomLevel = useRef(16);

  const [destination, setDestination] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    startLocationTracking();
    return () => {
      if (watchId.current !== null) Geolocation.clearWatch(watchId.current);
    };
  }, []);

  const getRoute = async (origin, destination) => {
    if (!origin || !destination) return;

    try {
      const response = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
        method: "POST",
        headers: {
          Authorization: ORS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [origin.longitude, origin.latitude],
            [destination.longitude, destination.latitude],
          ],
        }),
      });

      const data = await response.json();
      const coords = data?.features?.[0]?.geometry?.coordinates?.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));

      if (!coords?.length) return;
      setRouteCoordinates(coords);
    } catch (error) {
      console.log("Route Error:", error);
    }
  };

  const startLocationTracking = async () => {
    try {
      if (watchId.current !== null) {
        Geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }

      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log("Location permission denied");
          return;
        }

        await promptForEnableLocationIfNeeded({
          interval: 10000,
          fastInterval: 5000,
        });
      }

      watchId.current = Geolocation.watchPosition(
        position => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };

          let newHeading = headingRef.current;

          if (position.coords.heading !== null && position.coords.heading !== undefined && position.coords.heading >= 0) {
            newHeading = position.coords.heading;
          } else if (previousLocation.current) {
            const distance = Math.abs(coords.latitude - previousLocation.current.latitude) + Math.abs(coords.longitude - previousLocation.current.longitude);

            if (distance > 0.00005) {
              const bearing = getBearing(previousLocation.current.latitude, previousLocation.current.longitude, coords.latitude, coords.longitude);
              newHeading = smoothHeading(headingRef.current, bearing);
            }
          }
          headingRef.current = newHeading;
          previousLocation.current = coords;
          setCurrentLocation(coords);
          mapRef.current?.animateCamera(
            {
              center: coords,
              heading: newHeading,
              pitch: 0,
              zoom: 18,
            },
            { duration: 1000 }
          );

          const now = Date.now();
          if (destination && (lastRouteUpdate.current === 0 || now - lastRouteUpdate.current > 10000)) {
            lastRouteUpdate.current = now;
            getRoute(coords, destination);
          }
        },
        error => {
          console.log("Watch Error:", error);
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 3,
          interval: 3000,
          fastestInterval: 1000,
          forceRequestLocation: true,
          showLocationDialog: true,
        }
      );
    } catch (error) {
      console.log("Location Tracking Error:", error);
    }
  };

  const handleMapPress = e => {
    const newDestination = e.nativeEvent.coordinate;
    setDestination(newDestination);

    if (currentLocation) getRoute(currentLocation, newDestination);
  };

  const smoothHeading = (current, next) => {
    const diff = ((((next - current) % 360) + 540) % 360) - 180;
    return (current + diff * 0.2 + 360) % 360;
  };

  const getBearing = (startLat, startLng, endLat, endLng) => {
    const dLon = ((endLng - startLng) * Math.PI) / 180;
    const lat1 = (startLat * Math.PI) / 180;
    const lat2 = (endLat * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    let brng = (Math.atan2(y, x) * 180) / Math.PI;
    brng = (brng + 360) % 360;

    return brng;
  };

  const grayMapStyle = [
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
    { featureType: "administrative.land_parcel", elementType: "geometry", stylers: [{ color: "#d6d6d6" }] },
    { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f8f8f8" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e8e8e8" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfcfcf" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#666666" }] },
    { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  ];

  const searchPlaces = async text => {
    setSearchText(text);

    if (text.length < 2) {
      setPlaces([]);
      return;
    }

    try {
      const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=5`);
      const data = await response.json();

      setPlaces(data.features || []);
    } catch (error) {
      console.log("Search Error:", error);
    }
  };

  const centerOnCurrentLocation = () => {
    if (!currentLocation || !mapRef.current) return;
    zoomLevel.current = Math.min(zoomLevel.current + 1, 20);
    mapRef.current.animateCamera(
      {
        center: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
        heading: headingRef.current,
        pitch: 0,
        zoom: zoomLevel.current,
      },
      { duration: 700 }
    );
  };

  return (
    <>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      <View style={{ flex: 1 }}>
        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#ffe100" />
          </View>
        )}

        <View style={styles.searchBox}>
          <TextInput placeholder="Search your destination" value={searchText} onChangeText={searchPlaces} style={styles.input} placeholderTextColor="#505050" />

          <FlatList
            keyboardShouldPersistTaps="handled"
            data={places}
            keyExtractor={(item, index) => item.properties.osm_id?.toString() || index.toString()}
            style={styles.placesList}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  const newDestination = {
                    latitude: item.geometry.coordinates[1],
                    longitude: item.geometry.coordinates[0],
                  };

                  setDestination(newDestination);
                  getRoute(currentLocation, newDestination);
                  setSearchText(item.properties.name || item.properties.city || "");
                  setPlaces([]);

                  mapRef.current?.animateToRegion(
                    {
                      ...newDestination,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    },
                    1000
                  );

                  Keyboard.dismiss();
                }}
                style={styles.placeItem}
              >
                <Text style={{ color: "#000" }}>{item.properties.name}</Text>
                <Text style={{ color: "#777", fontSize: 12 }}>{item.properties.city || item.properties.state || item.properties.country}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {currentLocation?.latitude && currentLocation?.longitude && (
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            customMapStyle={grayMapStyle}
            onPress={handleMapPress}
            initialRegion={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            <Marker coordinate={currentLocation} flat={true} rotation={0} image={require("./src/images/bikerS.png")} anchor={{ x: 0.5, y: 0.5 }} />

            {destination && <Marker pinColor="#ff0000" coordinate={destination} title="Destination" />}

            {routeCoordinates.length > 0 && destination && <Polyline coordinates={routeCoordinates} strokeWidth={5} strokeColor="#282200" />}
          </MapView>
        )}

        <TouchableOpacity onPress={centerOnCurrentLocation} style={[styles.button, styles.zoomButton]}>
          <Text style={styles.buttonText}>Zoom</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={startLocationTracking} style={[styles.button, styles.locationButton]}>
          <Text style={styles.buttonText}>My Location</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

export default App;

const styles = StyleSheet.create({
  loader: {
    height: "100%",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    position: "absolute",
    zIndex: 9999999999,
  },
  searchBox: {
    position: "absolute",
    top: 50,
    left: 10,
    right: 10,
    zIndex: 99,
  },
  input: {
    height: 50,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 15,
    color: "#000",
  },
  placesList: {
    backgroundColor: "#fff",
    marginTop: 5,
    borderRadius: 12,
    maxHeight: 250,
  },
  placeItem: {
    padding: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  button: {
    position: "absolute",
    zIndex: 999,
    bottom: 30,
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
  },
  zoomButton: {
    right: 20,
  },
  locationButton: {
    alignSelf: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
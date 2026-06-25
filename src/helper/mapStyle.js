export const grayMapStyle = [
    {
        featureType: "all",
        elementType: "labels.icon",
        stylers: [{ visibility: "off" }],
    },
    {
        featureType: "poi",
        stylers: [{ visibility: "off" }],
    },
    {
        featureType: "transit",
        stylers: [{ visibility: "off" }],
    },
    {
        featureType: "road",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
    },
    {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#ffffff" }],
    },
    {
        featureType: "road.arterial",
        elementType: "geometry",
        stylers: [{ color: "#ededed" }],
    },
    {
        featureType: "road.highway",
        elementType: "geometry",
        stylers: [{ color: "#e0e0e0" }],
    },
    {
        featureType: "landscape",
        elementType: "geometry",
        stylers: [{ color: "#f5f5f5" }],
    },
    {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#d9d9d9" }],
    },
    {
        featureType: "administrative",
        elementType: "labels.text.fill",
        stylers: [{ color: "#999999" }],
    },
];
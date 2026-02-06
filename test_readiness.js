const { checkTripReadiness, getImminentTripsWithIssues, checkImminentTravelReadiness } = require('./server/src/services/travelReadinessService');

// Test checkTripReadiness for trip 81
console.log('Checking readiness for trip 81:');
const readiness = checkTripReadiness(81);
console.log(JSON.stringify(readiness, null, 2));

// Test getImminentTripsWithIssues for agency 91
console.log('\nGetting imminent trips with issues for agency 91:');
const trips = getImminentTripsWithIssues(91, 48);
console.log(JSON.stringify(trips, null, 2));

// Test checkImminentTravelReadiness
console.log('\nRunning checkImminentTravelReadiness:');
const result = checkImminentTravelReadiness(48);
console.log(JSON.stringify(result, null, 2));

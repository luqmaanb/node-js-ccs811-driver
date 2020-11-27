// get the ccs811 driver
const  CCS811 = require('ccs811');

// configure the necessary i2c parameters
const i2cSettings = {
  i2cBusNo   : 1, // i2c bus depending on linux platform
  i2cAddress : 0x5A // i2c address of bme280
};

// create new instance of bme280 driver with the above i2c settings
const ccs811 = new CCS811(i2cSettings);

// get the data
const readSensorData = () => {
  ccs811.readSensorData()
    .then((data) => { // report data on console if successful
      console.log(`data = ${JSON.stringify(data, null, 2)}`);
      setTimeout(readSensorData, 2000);
    })
    .catch((err) => { // report error on console if unsuccessul
      console.log(`CCS811 read error: ${err}`);
      setTimeout(readSensorData, 2000);
    });
};

// Initialize the CCS811 sensor
ccs811.init()
  .then(() => {
    console.log('CCS811 initialization succeeded');
    readSensorData();
  })
  .catch((err) => console.error(`CCS811 initialization failed: ${err} `));
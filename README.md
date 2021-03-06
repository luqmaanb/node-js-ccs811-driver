# node-js-ccs811-driver

This is a node.js module for the [CCS811](https://ams.com/-/ams-ccs8xx-product-family-of-voc-sensors-enhances-end-user-experience-for-indoor-air-quality-monitoring) developed by AMS. The sensor reports volatile organic compounds and equivalent CO2 levels. The module portable accross linux platforms such as Raspberry Pi and BeagleBone

## Usage

This is not an official node.js module hence it will need to be installed from github.

1. Install the module
```npm install luqmaanb/node-js-ccs811-driver```
2. Run the example ```sudo node example.js```

## Example

```js
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
```
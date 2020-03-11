var Accessory, Service, Characteristic, hap, UUIDGen;

var FFMPEG = require('./ffmpeg').FFMPEG;

// additions rapsberryPi PIR
var gpio = require('rpi-gpio');
gpio.setMode(gpio.MODE_BCM);

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  hap = homebridge.hap;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-camera-ffmpeg", "Camera-ffmpeg", ffmpegPlatform, true);
}

function ffmpegPlatform(log, config, api) {
  var self = this;

  self.log = log;
  self.config = config || {};

  if (api) {
    self.api = api;

    if (api.version < 2.1) {
      throw new Error("Unexpected API version.");
    }

    self.api.on('didFinishLaunching', self.didFinishLaunching.bind(this));
  }
}

ffmpegPlatform.prototype.configureAccessory = function(accessory) {
  // Won't be invoked
}

ffmpegPlatform.prototype.didFinishLaunching = function() {
  var self = this;
  var videoProcessor = self.config.videoProcessor || 'ffmpeg';
  var interfaceName = self.config.interfaceName || '';

  if (self.config.cameras) {
    var configuredAccessories = [];

    var cameras = self.config.cameras;
    cameras.forEach(function(cameraConfig) {
      var cameraName = cameraConfig.name;
      var videoConfig = cameraConfig.videoConfig;

      if (!cameraName || !videoConfig) {
        self.log("Missing parameters.");
        return;
      }

      var uuid = UUIDGen.generate(cameraName);
      var cameraAccessory = new Accessory(cameraName, uuid, hap.Accessory.Categories.CAMERA);
      var cameraAccessoryInfo = cameraAccessory.getService(Service.AccessoryInformation);
      if (cameraConfig.manufacturer) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.Manufacturer, cameraConfig.manufacturer);
      }
      if (cameraConfig.model) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.Model, cameraConfig.model);
      }
      if (cameraConfig.serialNumber) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.SerialNumber, cameraConfig.serialNumber);
      }
      if (cameraConfig.firmwareRevision) {
        cameraAccessoryInfo.setCharacteristic(Characteristic.FirmwareRevision, cameraConfig.firmwareRevision);
      }

      cameraAccessory.context.log = self.log;
      
      // addition
      cameraAccessory.context.motionDetected = false;

      if (cameraConfig.motion && cameraConfig.pirPin) {

        var motion = new Service.MotionSensor(cameraName);

        motion
          .getCharacteristic(Characteristic.MotionDetected)
          .on('get', (callback) => {
            callback(null, cameraAccessory.motionDetected);
          });

        gpio.on('change', (channel, value) => {
          if (channel === cameraConfig.pirPin && value !== cameraAccessory.motionDetected) {
            cameraAccessory.motionDetected = value;
            motion.setCharacteristic(Characteristic.MotionDetected, cameraAccessory.motionDetected);
          }
        });

        gpio.setup(cameraConfig.pirPin, gpio.DIR_IN, gpio.EDGE_BOTH, () => {
          gpio.read(cameraConfig.pirPin, (err, value) => {
            if (err) {
              console.error(err);
              return;
            }
            cameraAccessory.motionDetected = value;
          });
        });

        /*
        motion
          .getCharacteristic(Characteristic.Name)
          .on('get', (callback) => {
            console.log('HERE 2');
            callback(null, this.name);
          });
          */
      
        cameraAccessory.addService(motion);

      }

      var cameraSource = new FFMPEG(hap, cameraConfig, self.log, videoProcessor, interfaceName);
      cameraAccessory.configureCameraSource(cameraSource);
      configuredAccessories.push(cameraAccessory);
    });

    self.api.publishCameraAccessories("Camera-ffmpeg", configuredAccessories);
  }
};
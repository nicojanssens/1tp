#!/bin/bash

cordova platform add ios
cordova plugin add https://github.com/MobileChromeApps/cordova-plugin-chrome-apps-sockets-udp
cordova plugin add https://github.com/MobileChromeApps/cordova-plugin-chrome-apps-sockets-tcp
cordova build ios
cordova emulate ios

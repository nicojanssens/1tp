#!/bin/bash

cordova platform add ios
cordova plugin add --save https://github.com/MobileChromeApps/cordova-plugin-chrome-apps-sockets-udp
cordova plugin add --save https://github.com/MobileChromeApps/cordova-plugin-chrome-apps-sockets-tcp
cordova plugin add --save https://github.com/MobileChromeApps/cordova-plugin-chrome-apps-sockets-tcpserver
cordova build ios
cordova emulate ios

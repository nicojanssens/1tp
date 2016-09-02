#!/bin/bash

cordova platform add ios
cordova build ios --device
cordova run --debug --emulator ios
#cordova run ios

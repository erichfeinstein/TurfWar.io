import React from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  StatusBar,
  Dimensions,
} from 'react-native';
import { StackActions } from 'react-navigation';
import axios from 'axios';
import { Button, Icon } from 'react-native-elements';
import SocketIOClient from 'socket.io-client';
import MapView, { Circle } from 'react-native-maps';

import { getStatusBarHeight } from 'react-native-status-bar-height';

import mapStyle from '../mapStyle';
import { IP } from '../global';

const MAX_LAT_DELTA = 0.7;
const MAX_LONG_DELTA = 0.7;

const sBarHeight = getStatusBarHeight();
export default class World extends React.Component {
  constructor() {
    super();
    this.state = {
      latitude: 0,
      longitude: 0,
      viewedLat: 0,
      viewedLong: 0,
      viewedLatDelta: 0.0922,
      viewedLongDelta: 0.0421,
      caps: {},
      playerRadius: 0, //Radius that player sees of their effective area
      loadingUser: true,
    };
    //Binds
    this.updateState = this.updateState.bind(this);
    this.rememberMe = this.rememberMe.bind(this);
    this.captureArea = this.captureArea.bind(this);
    this.gotCapInfoFromServer = this.gotCapInfoFromServer.bind(this);
  }

  updateState(coords) {
    const latitude = coords.coords.latitude;
    const longitude = coords.coords.longitude;
    this.setState({
      latitude,
      longitude,
      viewedLat: latitude,
      viewedLong: longitude,
    });
  }

  gotCapInfoFromServer(caps, radius) {
    let mapOfCaps = {};
    caps.map(cap => {
      mapOfCaps[cap.id] = cap;
    });
    this.setState({
      caps: mapOfCaps,
      playerRadius: radius,
    });
  }

  async rememberMe() {
    const user = await axios.get(`${IP}/auth/rememberme`);
    this.props.navigation.setParams({ user: user.data });
    this.setState({
      loadingUser: false,
    });
  }

  componentDidMount() {
    this.rememberMe();
    //SOCKET
    this.socket = SocketIOClient(IP);
    this.socket.on('all-captures', this.gotCapInfoFromServer);
    this.socket.on('new-cap', cap => {
      let caps = this.state.caps;
      caps[cap.id] = cap;
      this.setState({
        caps,
      });
    });
    this.socket.on('destroy-cap', capToDestroy => {
      let caps = this.state.caps;
      delete caps[capToDestroy.cap.id];
      this.setState({
        caps,
      });
    });
    this.socket.on('out-of-caps', () => {
      this.props.navigation.navigate('World', { outOfCaps: true });
    });
    this.socket.on('daily-reset', () => {
      this.props.navigation.navigate('World', { outOfCaps: false });
      this.rememberMe();
    });
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition(this.updateState);
  }
  componentWillUnmount() {
    this.socket.emit('disconnect');
  }

  async captureArea() {
    console.log('Attempting to capture area');
    const user = this.props.navigation.getParam('user', {});
    if (user) {
      await this.socket.emit('capture', {
        latitude: this.state.latitude,
        longitude: this.state.longitude,
        userId: user.id,
      });
      let updatedUser = { ...user, capCount: user.capCount - 1 };
      this.props.navigation.setParams({ user: updatedUser });
    }
  }

  render() {
    const user = this.props.navigation.getParam('user', {});
    let latitude = this.state.latitude;
    let longitude = this.state.longitude;
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <StatusBar hidden={false} />
        {this.state.latitude ? (
          <MapView
            provider="google"
            customMapStyle={mapStyle}
            mapPadding={{ top: sBarHeight }}
            style={{ ...StyleSheet.absoluteFillObject, flex: 1 }}
            onRegionChangeComplete={region => {
              this.setState({
                viewedLat: region.latitude,
                viewedLong: region.longitude,
                viewedLatDelta: region.latitudeDelta,
                viewedLongDelta: region.longitudeDelta,
              });
            }}
            initialRegion={{
              latitude,
              longitude,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
            onUserLocationChange={pos => {
              this.setState({
                latitude: pos.nativeEvent.coordinate.latitude,
                longitude: pos.nativeEvent.coordinate.longitude,
              });
            }}
            showsCompass={false}
            showsUserLocation={true}
            showsMyLocationButton={true}
          >
            {/* Only show cap points where the user is looking in the MapView, and not when user is zoomed out very far */}
            {Object.values(this.state.caps).map(cap => {
              if (
                this.state.viewedLatDelta < MAX_LAT_DELTA &&
                this.state.viewedLongDelta < MAX_LONG_DELTA &&
                Math.abs(cap.latitude - this.state.viewedLat) <
                  this.state.viewedLatDelta &&
                Math.abs(cap.longitude - this.state.viewedLong) <
                  this.state.viewedLongDelta
              )
                return (
                  <Circle
                    key={cap.id}
                    lineCap="square"
                    lineJoin="bevel"
                    miterLimit={250}
                    strokeWidth={0}
                    fillColor={cap.user.team.color}
                    radius={cap.radius}
                    center={{
                      latitude: cap.latitude,
                      longitude: cap.longitude,
                    }}
                  />
                );
            })}
            <Circle
              center={{
                latitude,
                longitude,
              }}
              strokeWidth={4}
              strokeColor={'#00000030'}
              radius={this.state.playerRadius}
            />
          </MapView>
        ) : (
          <View style={styles.container}>
            <ActivityIndicator size="large" color="#0000ff" />
            <Text>Finding your location...</Text>
          </View>
        )}
        {this.state.latitude ? (
          <View>
            {user && user.capCount > 0 ? (
              <View style={styles.footer}>
                <Button
                  buttonStyle={{
                    borderRadius: 35,
                    width: 70,
                    height: 70,
                    flex: 1,
                    justifyContent: 'center',
                    backgroundColor: user.team.color,
                  }}
                  title={`${user.capCount}`}
                  onPress={() => this.captureArea()}
                />
              </View>
            ) : (
              <View
                style={{
                  ...styles.footer,
                  height: 50,
                  backgroundColor: '#bcbcbc50',
                }}
              >
                <Text>
                  {user.capCount === 0 ? 'Out of captures' : 'Sign in to play!'}
                </Text>
              </View>
            )}
            {/* Menu Button */}
            <View
              style={{
                top: sBarHeight + 20,
                left: 20,
                width: 40,
                height: 40,
              }}
            >
              <Icon
                size={40}
                name="menu"
                color="#000000"
                onPress={() => this.props.navigation.openDrawer()}
              />
            </View>
          </View>
        ) : (
          <View />
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    top: Dimensions.get('window').height - 170,
    width: Dimensions.get('window').width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButton: {
    position: 'absolute',
    top: 50,
    width: 50,
  },
});

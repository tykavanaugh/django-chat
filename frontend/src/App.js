import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

import $ from 'jquery';

function sortMessages(messageList) {
    return messageList.sort((a, b) => {
       return a.date_sent <= b.date_sent ? -1 :1;  
    });
}

function getMessageList(resObj) {
    const messageList = resObj.map((obj) => {
        return {
            text: obj.fields.text,
            author: obj.fields.author,
            date_sent: obj.fields.date_sent
        }
    });
    return sortMessages(messageList);
}

class App extends Component {
    render() {
        return (
            <div>
                <SPA />
            </div>
        );
    }
}

const SPA = React.createClass({
    getInitialState: function() {
        return {
            userPk: 0, 
            currentStream: 0,
            streamsDict: {},
            userDict: {},
            socket: {}
        };
    },

    sockets: function(userPk) {
        const ws = new WebSocket('ws://localhost:8000');
        ws.onmessage = (message) => {
            const data = JSON.parse(message.data)
            if (data.type === 'new_message') {
                const newState = Object.assign({}, this.state.streamsDict);
                newState[data.author].push({
                    text: data.text,
                    author: data.author
                });
                this.setState({
                    streamsDict: newState 
                });
            } else if (data.type === 'message_echo') {
                const newState = Object.assign({}, this.state.streamsDict);
                newState[data.recipient].push({
                    text: data.text,
                    author: this.state.userPk
                });
                this.setState({
                    streamsDict: newState 
                });
            }
        }

        ws.onopen = () => {
            const handshake = {
                type: 'handshake',
                user: userPk
            }
            ws.send(JSON.stringify(handshake));
        }
        this.setState({
            socket: ws
        });
    },

    componentDidMount: function() {
        $.get('api/v1/users/get', (userRes) => {
            this.sockets(userRes.pk);
            this.setState({
                userPk: userRes.pk
            });
            $.get('api/v1/users', (res) => {
                const users = {};
                res.forEach((user) => {
                    users[user.pk] = user.fields.username;
                });
                this.setState({
                    userDict: users
                });
            });

            const streamURL = `/api/v1/users/${this.state.userPk}/streams/`;
            $.get(streamURL, (res) => {
                const streamsDict = {}; 
                res.streams.forEach((stream) => {
                   streamsDict[stream.friend] = getMessageList(JSON.parse(stream.messages));
                });
                this.setState({
                   streamsDict: streamsDict, 
                   currentStream: Object.keys(streamsDict)[0]
                });
            });
        });
    },

    changeStream: function(userPk) {
        this.setState({
            currentStream: userPk 
       });
    },

    render: function() {
        let messageList;
        let friendList;
        if (Object.keys(this.state.streamsDict).length > 0) {
            const currentStream = this.state.streamsDict[this.state.currentStream];
            if (currentStream) {
                messageList = currentStream;
            } else {
                messageList = [];
            }
            friendList = Object.keys(this.state.streamsDict);
        } else {
            messageList = [];
            friendList = [];
        }       
        const otherUsers = Object.keys(this.state.userDict).filter((user) => {
            if (friendList.indexOf(user) === -1 && user !== this.state.userPk) {
                return true; 
            }
            return false;
        });

        return (
            <div>
                <div>
                    <h1>hi, {this.state.userDict[this.state.userPk]}.</h1>
                    <form action='http://127.0.0.1:8000/logout'>
                        <button type='submit'>logout</button>
                    </form>
                </div>
                <br />
                <div className='flex-container'>
                    <div className='flex-item-1'>
                        <h2>friends</h2>
                        <Users 
                            userDict={ this.state.userDict }
                            userList={ friendList }
                            changeStream={ this.changeStream }
                            id='friends'
                        />
                        <h2>other users</h2>
                        <Users
                            userDict={ this.state.userDict }
                            userList={ otherUsers }
                            changeStream={ this.changeStream }
                            id='other-users'
                        />
                    </div>
                    <div className='flex-item-2'>
                        <h2>chat with { this.state.userDict[this.state.currentStream] }</h2>
                        <Messages
                            messageList={ messageList }
                            userPk={ this.state.userPk }
                        />
                        <Write
                            socket={ this.state.socket }
                            author={ this.state.userPk }
                            recipient={ this.state.currentStream }
                        />
                    </div>
                </div>
            </div>
        );
    } 
});

const Users = React.createClass({
    render: function() {
        const userComponents = this.props.userList.map((user) => {
           return {
               pk: user,
               username: this.props.userDict[user]
           };
        }).map((data) => {
           return (
               <User
                   data={data}
                   changeStream={this.props.changeStream}
               /> 
            ); 
        });
        return (
            <div className="splits" id={ this.props.id }>
                <ul>
                    { userComponents.map((component) => {
                        return (
                            <li>
                                { component }
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }
});

const User = React.createClass({
    render: function() {
        const changeStream = () =>  {
            this.props.changeStream(this.props.data.pk);
        };
        return (
            <a
                href='#'
                onClick={changeStream}
            >
                { this.props.data.username }
            </a>
        )
    }
});

const Messages = React.createClass({

    componentDidUpdate: function() {
        console.log('updating!');
        this.refs.messagesDiv.scrollTop = this.refs.messagesDiv.scrollHeight;
    },

    render: function() {
        const messages = this.props.messageList.map((message) => {
            if (message.author === this.props.userPk) {
                return (<li className='from-user'> { message.text } </li>);
            } else {
                return (<li className='from-other'> { message.text } </li>);
            }
        });
        return (
            <div className='splits' id='messages' ref='messagesDiv'>
                <ul>
                    { messages }
                </ul>
            </div>
        );
    }
});

const Write = React.createClass({
    getInitialState: function() {
        return {
            text: ''
        };
    },

    postMessage: function(event) {
        const data = {
            type: 'message',
            text: this.state.text,
            date_sent: Date.now(),
            author: this.props.author,
            recipient: this.props.recipient
        }
        this.props.socket.send(JSON.stringify(data));
        event.preventDefault();
        this.setState({
            text: ''
        });
        
    },

    editMessage: function(event) {
        this.setState({
            text: event.target.value
        });
    },

    render: function() {
        return (
            <div className='send-message'>
                <form onSubmit={ this.postMessage }>
                    <textarea
                        onChange={ this.editMessage }
                        value={ this.state.text }
                    />
                    <button className='message-button' type='submit'>
                        send message
                    </button>
                </form>
            </div>
        );
    }
});

export default App;

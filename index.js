const net = require('net');

const config = {
	ip: "127.0.0.1",
	port: "8080",
	maxConnections: 100
}

const sockets = [];

setInterval(function(){
	/*
		timer resets idle sockets 
	*/
	const dn = Date.now();
	for(let i in sockets){
		if((sockets[i].lastData + 200000) < dn){
			sockets[i].remote.destroy();
			sockets[i].local.destroy();
			sockets.splice(i,1);
			break;
		}
	}
},2000);

const server = net.createServer((socket) => {
	let state = PROXY_STATE.INIT;
	let domain = "";
	let port = 80;
	
	if(sockets.length > config.maxConnections) return close("Maximum connections reached");
	
	const client = new net.Socket();
	const socketInfo = {local: socket, remote: client, lastData: Date.now()};
	
	/*
		we need to add this object to sockets se we can monitor it for being idle
	*/
	sockets.push(socketInfo);
	
	socket.on("close", function(){
		client.destroy();
		socket.destroy();
		sockets.splice(sockets.indexOf(socketInfo), 1);
	});
	
	socket.on("data", function(bytes){
		if(state < 2 && bytes[0] != 5) return close("Protocol violation");
		socketInfo.lastData = Date.now();
		switch(state){
			case PROXY_STATE.INIT:
				if(bytes[2] != 0) return close("Unsupported auth method");
				socket.write(Byte(5) + Byte(0));
				state = PROXY_STATE.CONN_REQUEST;
				break;
				
			case PROXY_STATE.CONN_REQUEST:
				if(bytes[3] == 1){
					/*
					ipv4. do this later
					*/
					
				}else if(bytes[3] == 3){
					/*
					domain (remote-dns)
					
					domain is is in ascii, bytes[4] is the length of the domain
					*/
					port = byteArrayToLong([bytes[bytes.length - 1], bytes[bytes.length - 2]]);
					for (let i = 5; i < parseInt(bytes[4]) + 5; i++) {
						domain += String.fromCharCode(bytes[i]);
					}
					
					const TLD = domain.substr(domain.lastIndexOf(".")+1);
					if(TLD == "taco") domain = "127.0.0.1"; //hijacks all taco tld's... for fun
					console.log(domain + ":" + port);
				}else if(bytes[3] == 4){
					/*
					ipv6. Do this later.
					*/
					
				}
				
				
				
				client.connect(port, domain, function() {
					state = PROXY_STATE.TUNNEL;
					bytes[1] = 0;
					socket.write(bytes);
				});
				
				client.on('data', function(data) {
					socket.write(data);
					socketInfo.lastData = Date.now();
				});
				
				client.on('error', function(data) {
					bytes[1] = 1;
					socket.write(bytes);
					client.destroy();
					socket.destroy();
				});
				
				client.on('close', function(data) {
					client.destroy();
					socket.destroy();
				});
				
				state = PROXY_STATE.CONN_WAIT;
				break;
				
			case PROXY_STATE.TUNNEL:
				client.write(bytes);
				break;
		}
		
	});

	socket.on("error", function(e){
		socket.destroy();
	});
	
	function close(e){
		socket.destroy();
		console.log(e);
	}
	
	function Byte(e){
		return String.fromCharCode(e);
	}
	
	function byteArrayToLong(/*byte[]*/byteArray) {
		var value = 0;
		for ( var i = byteArray.length - 1; i >= 0; i--) {
			value = (value * 256) + byteArray[i];
		}

		return value;
	};
	
	//socket.end('HTTP 200 OK\r\nConnection: close\r\n\r\nhello');
}).on('error', (err) => {
	// Handle errors here.
	throw err;
});

server.listen(config.port, config.ip, () => {
	console.log('opened server on', server.address());
});

const PROXY_STATE = {
	INIT: 0,
	CONN_REQUEST: 1,
	CONN_WAIT: 2,
	TUNNEL: 3
}
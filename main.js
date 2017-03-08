'use strict';
var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");

var fs = require('fs');

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

var nPeers = 1;         //numero de conexoes que ele suporta
var aux1 = 0;

//Bloco

//lendo valores de arquivo.
//endereço
//var leArquivo = fs.readFileSync('/Users/Portal/Desktop/docTeste.txt', 'ascii');

//var arq = leArquivo;

//console.log(arq);


class Block {
    constructor(index, previousHash, timestamp, data, hash) {
        this.index = index;
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
    }
}

//sockets

var sockets = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

//cração bloco genesis

var getGenesisBlock = () => {
    return new Block(0, "0", 1465154705, "my genesis block!!", "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
    //return new Block(0, "0", 1465154705, arq, "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
};

//colocando genesis na blockchain

var blockchain = [getGenesisBlock()];

//interface http

var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());

    //app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain)));
    app.get('/blocks', (req, res) => {
	var R="";
	for(var I=0;I<blockchain.length;I++){
            R += '\nBloco: \nIndex: ' + blockchain[I].index + '\nHash anterior: ' + blockchain[I].previousHash + '\nTimestamp: '+blockchain[I].timestamp + '\nData: '+blockchain[I].data + '\nHash: '+ blockchain[I].hash+'\n';
        }
        res.send(R);
    });


    //app.post('/mineBlock', (req, res) => {
    //    var newBlock = generateNextBlock(req.body.data);
    //    addBlock(newBlock);
    //    broadcast(responseLatestMsg());
    //    console.log('block added: ' + JSON.stringify(newBlock));
    //    res.send();
    //});

    app.post('/mineBlock', (req, res) => {
        var newBlock = generateNextBlock(req.body.data);
        //var newBlock = generateNextBlock(leArquivo);
        addBlock(newBlock);
        broadcast(responseLatestMsg());
        console.log('bloco adicionado:\nindice: ' + newBlock.index +'\nhash anterior: '+newBlock.previousHash+'\nTimestamp: '+newBlock.timestamp+'\ndata: '+newBlock.data+'\nhash: '+newBlock.hash+'\n');
        res.send();
    });


    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });

    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.listen(http_port, () => console.log('Listening http on port: ' + http_port + '\n'));
};

//interface p2p

var initP2PServer = () => {
    var server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port + '\n');

};


var initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};

//gerando novo bloco

var generateNextBlock = (blockData) => {
    var previousBlock = getLatestBlock();
    var nextIndex = previousBlock.index + 1;
    var nextTimestamp = new Date().getTime() / 1000;
    var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    return new Block(nextIndex, previousBlock.hash, nextTimestamp, /*local onde é colocado conteudo*/blockData/*var blockData*/, nextHash);
};

//calculando hash

var calculateHashForBlock = (block) => {
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};

var calculateHash = (index, previousHash, timestamp, data) => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
};

//adicionando novo bloco

var addBlock = (newBlock) => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
    }
};

//validando bloco

var isValidNewBlock = (newBlock, previousBlock) => {
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    }
    return true;
};

// conectando com outros peers

var connectToPeers = (newPeers) => {
	
	if(aux1 < nPeers){
		newPeers.forEach((peer) => {

		    var ws = new WebSocket(peer);
	
		    ws.on('open', () => {
				aux1=aux1+1; 
				initConnection(ws);  
			});
		    ws.on('error', () => {
		        console.log('connection failed');
				aux1 = aux1-1;
		    });
		});
	}else{
		console.log('numero maximo de peers atingidos');
	}
};

// resposta de coneção com peer

var handleBlockchainResponse = (message) => {
    var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index > b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log("We can append the received block to our chain");
            blockchain.push(latestBlockReceived);
            broadcast(responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
            broadcast(queryAllMsg());
        } else {
            console.log("Received blockchain is longer than current blockchain");
            replaceChain(receivedBlocks);
        }
    } else {
        console.log('received blockchain is not longer than received blockchain. Do nothing');
    }
};

//realocação de chain.

var replaceChain = (newBlocks) => {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
		
		
		
        //blockchain = newBlocks;
		
		realocaChain(newBlocks);
		
        broadcast(responseLatestMsg());
    } else {
        console.log('Received blockchain invalid');
    }
};

// validação da chain.

var isValidChain = (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

//meus metodos

var realocaChain = (newChain) => {
	
	var igual = false;
	
	for(var I=0;I<newChain.length;I++){
		
		if(!buscaBloco(newChain[I])){
			igual = true;
		}
		
		if(igual){
			var newBlock = generateNextBlock(newChain[I].data);
			addBlock(newBlock);
			igual = false;
		}
		
	}
	
}


var buscaBloco = (block) => {
	for(var I=0;I<blockchain.length;I++){
		if(blockchain[I].data == block.data){
			return true;
		}
	}
	return false;
}


var getLatestBlock = () => blockchain[blockchain.length - 1];
var queryChainLengthMsg = () => ({'type': MessageType.QUERY_LATEST});
var queryAllMsg = () => ({'type': MessageType.QUERY_ALL});
var responseChainMsg = () =>({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();

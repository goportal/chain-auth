# chain-auth 


### Começando

##### Adicionar bloco
```
curl -H "Content-type:application/json" --data '{"data" : "Primeiro Bloco"}' http://localhost:3001/mineBlock
``` 

##### Adicionar peer
```
curl -H "Content-type:application/json" --data '{"peer" : "ws://localhost:6001"}' http://localhost:3001/addPeer
```

##### Listar blockchain blockchain
```
curl http://localhost:3001/blocks
```

#### Listar peers
```
curl http://localhost:3001/peers
```

import { GameEngine } from '../dist/game/engine.js'

const table = {
  tableId: 'RIG-TABLE',
  seats: [
    { playerId: 'P1', seatIndex: 0, chips: 3000 },
    { playerId: 'P2', seatIndex: 1, chips: 3000 },
  ],
}

const eng = new GameEngine(table, { sb: 25, bb: 50 })

// Rig AT vs A9 on AKKQ8
eng.rig({
  holeBySeat: {
    0: [ { suit:'spades', rank:14 }, { suit:'hearts', rank:10 } ],
    1: [ { suit:'clubs',  rank:14 }, { suit:'diamonds', rank:9 } ],
  },
  community: [
    { suit:'spades',   rank:14 }, // A
    { suit:'clubs',    rank:13 }, // K
    { suit:'hearts',   rank:13 }, // K
    { suit:'diamonds', rank:12 }, // Q
    { suit:'clubs',    rank:8  }, // 8
  ],
})

eng.nextHand({ sb: 25, bb: 50 })
// Deal to showdown without betting (blinds only pot)
eng.advanceStreet() // flop
eng.advanceStreet() // turn
eng.advanceStreet() // river
eng.advanceStreet() // showdown

const pub = eng.getPublic()
console.log(JSON.stringify({ pot: pub.pot, winners: pub.lastWinners, community: pub.community, players: pub.players.map(p=>({id:p.playerId, chips:p.chips})) }, null, 2))



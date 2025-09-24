export interface BlindLevel {
  index: number
  durationSec: number
  smallBlind: number
  bigBlind: number
}

export interface PlayerSeat {
  playerId: string
  seatIndex: number
  chips: number
}

export interface TableState {
  tableId: string
  seats: PlayerSeat[]
}



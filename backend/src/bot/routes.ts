/**
 * POKERGODS Bot Arena - API Routes
 * Simple Heads-Up SNG System with Leaderboard
 */

import { Router } from 'express'
import type { Request, Response } from 'express'
import {
  registerBot,
  getBot,
  getBotByName,
  listBots,
  deleteBot,
  getLeaderboard,
  requireBotAuth,
  generateApiKey,
  listKeysForBot,
  revokeApiKey,
  getConnectedBotCount,
  getConnectedBotIds,
  isBotConnected,
} from './index.js'
import {
  joinQueue,
  leaveQueue,
  getQueueStatus,
  getQueuePosition,
  getActiveMatches,
  getBotMatch,
  isInMatch,
} from './matchmaking.js'

export const botRouter = Router()

// ============== Bot Registration ==============

/**
 * POST /api/v1/bot/register
 */
botRouter.post('/register', (req: Request, res: Response) => {
  try {
    const { name, ownerId } = req.body || {}
    
    if (!name || typeof name !== 'string') {
      res.status(400).json({ ok: false, error: 'Bot name required' })
      return
    }
    
    if (!ownerId || typeof ownerId !== 'string') {
      res.status(400).json({ ok: false, error: 'Owner ID (wallet) required' })
      return
    }
    
    const result = registerBot(name, ownerId)
    
    if ('error' in result) {
      res.status(400).json({ ok: false, error: result.error })
      return
    }
    
    res.json({
      ok: true,
      bot: {
        botId: result.bot.botId,
        name: result.bot.name,
        ownerId: result.bot.ownerId,
        createdAt: result.bot.createdAt,
        stats: result.bot.stats,
      },
      apiKey: result.apiKey,
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

// ============== Leaderboard ==============

/**
 * GET /api/v1/bot/leaderboard
 */
botRouter.get('/leaderboard', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const leaderboard = getLeaderboard(limit)
    
    res.json({
      ok: true,
      leaderboard,
      connectedBots: getConnectedBotCount(),
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

// ============== Arena Status ==============

/**
 * GET /api/v1/bot/status
 */
botRouter.get('/status', (req: Request, res: Response) => {
  try {
    const queueStatus = getQueueStatus()
    const activeMatches = getActiveMatches()
    
    res.json({
      ok: true,
      status: {
        connectedBots: getConnectedBotCount(),
        queueSize: queueStatus.queueSize,
        activeMatches: activeMatches.length,
        matches: activeMatches.map(m => ({
          matchId: m.matchId,
          bot1Id: m.bot1Id,
          bot2Id: m.bot2Id,
          handsPlayed: m.handsPlayed,
          chips: m.chips,
        })),
      },
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

// ============== Matchmaking Queue ==============

/**
 * POST /api/v1/bot/queue/join
 */
botRouter.post('/queue/join', requireBotAuth, (req: Request, res: Response) => {
  try {
    const botId = (req as any).botId as string
    const result = joinQueue(botId)
    
    if (!result.ok) {
      res.status(400).json(result)
      return
    }
    
    res.json({
      ok: true,
      position: result.position,
      message: `Joined queue at position ${result.position}`,
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

/**
 * POST /api/v1/bot/queue/leave
 */
botRouter.post('/queue/leave', requireBotAuth, (req: Request, res: Response) => {
  try {
    const botId = (req as any).botId as string
    leaveQueue(botId)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

/**
 * GET /api/v1/bot/queue/status
 */
botRouter.get('/queue/status', (req: Request, res: Response) => {
  try {
    const status = getQueueStatus()
    res.json({ ok: true, ...status })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

// ============== Bot Match Status ==============

/**
 * GET /api/v1/bot/match
 */
botRouter.get('/match', requireBotAuth, (req: Request, res: Response) => {
  try {
    const botId = (req as any).botId as string
    const match = getBotMatch(botId)
    
    if (!match) {
      const position = getQueuePosition(botId)
      res.json({ 
        ok: true, 
        inMatch: false,
        inQueue: position > 0,
        queuePosition: position,
      })
      return
    }
    
    const opponentId = match.bot1Id === botId ? match.bot2Id : match.bot1Id
    const opponent = getBot(opponentId)
    
    res.json({
      ok: true,
      inMatch: true,
      matchId: match.matchId,
      opponent: {
        botId: opponentId,
        name: opponent?.name ?? 'Unknown',
        elo: opponent?.stats.elo ?? 1500,
      },
      yourChips: match.chips[botId],
      opponentChips: match.chips[opponentId],
      handsPlayed: match.handsPlayed,
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

// ============== Live Matches (Spectator) ==============

/**
 * GET /api/v1/bot/matches
 */
botRouter.get('/matches', (req: Request, res: Response) => {
  try {
    const matches = getActiveMatches()
    
    res.json({
      ok: true,
      matches: matches.map(m => {
        const bot1 = getBot(m.bot1Id)
        const bot2 = getBot(m.bot2Id)
        return {
          matchId: m.matchId,
          bot1: { botId: m.bot1Id, name: bot1?.name ?? 'Unknown', chips: m.chips[m.bot1Id] },
          bot2: { botId: m.bot2Id, name: bot2?.name ?? 'Unknown', chips: m.chips[m.bot2Id] },
          handsPlayed: m.handsPlayed,
          startTime: m.startTime,
        }
      }),
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

// ============== Bot Lookup ==============

/**
 * GET /api/v1/bot/name/:name
 */
botRouter.get('/name/:name', (req: Request, res: Response) => {
  try {
    const name = req.params.name ?? ''
    if (!name) {
      res.status(400).json({ ok: false, error: 'Name required' })
      return
    }
    const bot = getBotByName(name)
    
    if (!bot) {
      res.status(404).json({ ok: false, error: 'Bot not found' })
      return
    }
    
    res.json({
      ok: true,
      bot: {
        botId: bot.botId,
        name: bot.name,
        status: bot.status,
        stats: bot.stats,
        isConnected: isBotConnected(bot.botId),
        inMatch: isInMatch(bot.botId),
      },
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

// ============== Bot by ID (must be after static routes!) ==============

/**
 * GET /api/v1/bot/:botId
 */
botRouter.get('/:botId', (req: Request, res: Response) => {
  try {
    const botId = req.params.botId ?? ''
    if (!botId) {
      res.status(400).json({ ok: false, error: 'Bot ID required' })
      return
    }
    const bot = getBot(botId)
    
    if (!bot) {
      res.status(404).json({ ok: false, error: 'Bot not found' })
      return
    }
    
    res.json({
      ok: true,
      bot: {
        botId: bot.botId,
        name: bot.name,
        status: bot.status,
        createdAt: bot.createdAt,
        lastActiveAt: bot.lastActiveAt,
        stats: bot.stats,
        isConnected: isBotConnected(bot.botId),
        inMatch: isInMatch(bot.botId),
      },
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

/**
 * DELETE /api/v1/bot/:botId
 */
botRouter.delete('/:botId', requireBotAuth, (req: Request, res: Response) => {
  try {
    const botId = req.params.botId ?? ''
    if (!botId) {
      res.status(400).json({ ok: false, error: 'Bot ID required' })
      return
    }
    const bot = getBot(botId)
    
    if (!bot) {
      res.status(404).json({ ok: false, error: 'Bot not found' })
      return
    }
    
    if (bot.ownerId !== (req as any).botOwnerId) {
      res.status(403).json({ ok: false, error: 'Not authorized' })
      return
    }
    
    deleteBot(botId)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

/**
 * POST /api/v1/bot/:botId/key
 */
botRouter.post('/:botId/key', requireBotAuth, (req: Request, res: Response) => {
  try {
    const botId = req.params.botId ?? ''
    if (!botId) {
      res.status(400).json({ ok: false, error: 'Bot ID required' })
      return
    }
    const bot = getBot(botId)
    
    if (!bot) {
      res.status(404).json({ ok: false, error: 'Bot not found' })
      return
    }
    
    if (bot.ownerId !== (req as any).botOwnerId) {
      res.status(403).json({ ok: false, error: 'Not authorized' })
      return
    }
    
    const { rawKey, record } = generateApiKey(botId, bot.ownerId)
    
    res.json({
      ok: true,
      apiKey: rawKey,
      keyHash: record.keyHash,
      createdAt: record.createdAt,
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

/**
 * GET /api/v1/bot/:botId/keys
 */
botRouter.get('/:botId/keys', requireBotAuth, (req: Request, res: Response) => {
  try {
    const botId = req.params.botId ?? ''
    if (!botId) {
      res.status(400).json({ ok: false, error: 'Bot ID required' })
      return
    }
    const bot = getBot(botId)
    
    if (!bot) {
      res.status(404).json({ ok: false, error: 'Bot not found' })
      return
    }
    
    if (bot.ownerId !== (req as any).botOwnerId) {
      res.status(403).json({ ok: false, error: 'Not authorized' })
      return
    }
    
    const keys = listKeysForBot(botId)
    
    res.json({
      ok: true,
      keys: keys.map(k => ({
        keyHash: k.keyHash.slice(0, 8) + '...',
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        permissions: k.permissions,
      })),
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

/**
 * DELETE /api/v1/bot/:botId/key/:keyHash
 */
botRouter.delete('/:botId/key/:keyHash', requireBotAuth, (req: Request, res: Response) => {
  try {
    const botId = req.params.botId ?? ''
    const keyHash = req.params.keyHash ?? ''
    if (!botId || !keyHash) {
      res.status(400).json({ ok: false, error: 'Bot ID and key hash required' })
      return
    }
    const bot = getBot(botId)
    
    if (!bot) {
      res.status(404).json({ ok: false, error: 'Bot not found' })
      return
    }
    
    if (bot.ownerId !== (req as any).botOwnerId) {
      res.status(403).json({ ok: false, error: 'Not authorized' })
      return
    }
    
    const revoked = revokeApiKey(keyHash)
    res.json({ ok: true, revoked })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

// ============== List All Bots ==============

/**
 * GET /api/v1/bots
 */
botRouter.get('/', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const sortBy = (req.query.sortBy as 'elo' | 'wins' | 'created' | 'active') || 'elo'
    
    const bots = listBots({ limit, sortBy })
    
    res.json({
      ok: true,
      bots: bots.map(b => ({
        botId: b.botId,
        name: b.name,
        status: b.status,
        stats: b.stats,
        isConnected: isBotConnected(b.botId),
        inMatch: isInMatch(b.botId),
      })),
      total: bots.length,
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' })
  }
})

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is a Language Server implementation to support Crash Monitoring.
 *
 * IMPORTANT: Nothing from the core extension should import anything from this file, otherwise the build
 *           may break. I.e do not export anything in this module.
 */

import { createConnection, ProposedFeatures } from 'vscode-languageserver/node'
import { crashHeartbeatInterval, CrashNotifications } from './crashMonitoringTypes'
import fs from 'node:fs/promises'

// import { DefaultTelemetryService } from './telemetry/telemetryService'
import path from 'node:path'

// Create the LSP connection
const connection = createConnection(ProposedFeatures.all)

let lastHeartbeat: number
let timeout: NodeJS.Timeout

let rootDir: string
let sessionId: string
let extensionId: string
let didStart = false

// Handle the custom start notification
connection.onNotification(CrashNotifications.Start, async (args) => {
    if (didStart) {
        throw new Error('CrashServer: Already started')
    }
    didStart = true

    connection.console.log(`CrashServer: Started w/ PID: ${process.pid}`)

    rootDir = args.rootDir
    sessionId = args.sessionId
    extensionId = args.extensionId

    lastHeartbeat = Date.now() // init
    // checks if heartbeats are stale
    timeout = setTimeout(async () => {
        await declareCrash(sessionId, lastHeartbeat)
        // process.exit(0)
    }, crashHeartbeatInterval * 2)

    // checks for declared crashes
    setInterval(async () => {
        const readdir = await fs.readdir(await getCrashDir(), { withFileTypes: true })
        for (const res of readdir) {
            if (!res.isFile()) {
                continue
            }

            const fileName = res.name
            const filePath = path.join(await getCrashDir(), fileName)

            let content: string
            try {
                content = await fs.readFile(filePath, 'utf-8')
            } catch (e) {
                continue
            }

            const metadata = tryParseCrashMetadata(content)
            if (!metadata) {
                continue
            }

            await connection.sendNotification(CrashNotifications.TelemetryNotification, {
                sessionId: metadata.sessionId,
                lastHeartbeat: metadata.lastHeartbeat,
            })
            await fs.rm(filePath, { force: true, maxRetries: 3 })
        }
    }, crashHeartbeatInterval * 2)
})

connection.onNotification(CrashNotifications.Heartbeat, () => {
    throwIfNotStarted('heartbeat')
    connection.console.log(`CrashServer: Received heartbeat`)
    timeout.refresh()
    lastHeartbeat = Date.now()
})

connection.onNotification(CrashNotifications.Stop, () => {
    connection.console.log(`CrashServer: Received stop notification`)
    process.exit(0)
})

async function declareCrash(sessionId: string, lastHeartbeat: number) {
    const crashFile = path.join(await getCrashDir(), sessionId)
    const data: HeartbeatMetadata = { lastHeartbeat, sessionId }
    await fs.writeFile(crashFile, JSON.stringify(data))
}

async function getCrashDir() {
    throwIfNotStarted('getCrashDir')
    const crashDirPath = path.join(rootDir, extensionId, 'crashedSessions')
    await fs.mkdir(crashDirPath, { recursive: true })
    return crashDirPath
}

function tryParseCrashMetadata(metadata: string): HeartbeatMetadata | undefined {
    let obj: HeartbeatMetadata
    try {
        obj = JSON.parse(metadata)
    } catch (e) {
        return
    }

    if (typeof obj === 'object' && typeof obj.sessionId === 'string' && typeof obj.lastHeartbeat === 'number') {
        return obj
    }
}

function throwIfNotStarted(action: string) {
    if (!didStart) {
        throw new Error(`CrashServer: Not started during '${action}'`)
    }
}

type HeartbeatMetadata = {
    sessionId: string
    lastHeartbeat: number
}

connection.onShutdown(async () => {
    connection.console.log(`CrashServer: Received shutdown request`)
    await getCrashDir().then(async (crashDir) => {
        await fs.writeFile(path.join(crashDir, 'onShutdown'), '')
    })
})

connection.onExit(async () => {
    connection.console.log(`CrashServer: Received shutdown request`)
    await getCrashDir().then(async (crashDir) => {
        await fs.writeFile(path.join(crashDir, 'onExit'), '')
    })
})

process.on('disconnect', async (...args) => {
    await getCrashDir().then(async (crashDir) => {
        await fs.writeFile(path.join(crashDir, 'process.onDisconnect'), JSON.stringify(args))
    })
})

connection.listen()

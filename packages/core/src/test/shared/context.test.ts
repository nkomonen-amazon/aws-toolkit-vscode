/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getCurrentExecutionContext, withExecutionContext } from '../../shared/context'
import { sleep } from '../../shared/utilities/timeoutUtils'

/**
 * A class that uses execution context in its methods calls
 */
class TestClassA1 {
    constructor(readonly a2: TestClassA2) {}

    methodA(): Promise<string> {
        return this.withExecutionContext(this.methodA.name, () => this.methodB())
    }

    /**
     * IMPORTANT: this does not set a context, so it will not be included. But
     * any nested calls that set their own execution context will.
     */
    methodB() {
        return this.a2.methodX()
    }

    /** Helper to reduce duplication */
    private withExecutionContext(source: string, callback: () => any) {
        return withExecutionContext({ source: source, class: TestClassA1.name }, callback)
    }
}

/**
 * Another class that uses execution context in its calls
 */
class TestClassA2 {
    methodX(): Promise<string> {
        return this.withExecutionContext(this.methodX.name, async () => {
            // sleep to hand over execution to the other class
            await sleep(100)
            return this.methodY()
        })
    }

    methodY() {
        return this.withExecutionContext(this.methodY.name, () => this.methodZ())
    }

    methodZ() {
        return this.withExecutionContext('thisIsAlsoZ', () => functionWithExecutionContext())
    }

    /** Helper to reduce duplication */
    private withExecutionContext(source: string, callback: () => any) {
        return withExecutionContext({ source: source, class: TestClassA2.name }, callback)
    }
}

/**
 * Another class that uses execution context in its calls
 */
class TestClassB1 {
    async methodJ(): Promise<string> {
        return this.withExecutionContext(this.methodJ.name, () => this.methodK())
    }

    methodK() {
        return this.withExecutionContext(this.methodK.name, async () => {
            // sleep to hand over execution to the other class
            await sleep(100)
            return this.methodL()
        })
    }

    methodL() {
        return this.withExecutionContext(this.methodL.name, () => functionWithExecutionContext())
    }

    /** Helper to reduce duplication */
    private withExecutionContext(source: string, callback: () => any) {
        return withExecutionContext({ source: source, class: TestClassB1.name }, callback)
    }
}

function functionWithExecutionContext() {
    return withExecutionContext({ source: functionWithExecutionContext.name }, () => {
        return getCurrentExecutionContext()?.sourceStack
    })
}

describe('ExecutionContext', function () {
    it(`execution context is a stringified stack of all functions that used ${withExecutionContext.name}`, async function () {
        // This test runs multiple functions that use the context asynchronously. They sleep() part way through their entire flow,
        // which allows the other to execute. We expect the async local storage to maintain the correct context for each execution.
        // The final nested function call in each stack returns the final stringified source stack.

        const a1 = new TestClassA1(new TestClassA2())
        const b1 = new TestClassB1()

        const [resA1, resB1] = await Promise.all([a1.methodA(), b1.methodJ()])
        assert.deepStrictEqual(
            resA1,
            'TestClassA1#methodA:TestClassA2#methodX,methodY,thisIsAlsoZ:functionWithExecutionContext'
        )
        assert.deepStrictEqual(resB1, 'TestClassB1#methodJ,methodK,methodL:functionWithExecutionContext')
    })
})

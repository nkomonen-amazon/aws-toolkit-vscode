/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncLocalStorage } from './telemetry/spans'

/**
 * Returns the latest execution context.
 *
 * Ensure your functions are wrapping their code with {@link withExecutionContext} to actually
 * add the execution context to the call stack. Otherwise, this will be missing data.
 */
export function getCurrentExecutionContext(): ExecutionContextStore | undefined {
    return executionContext.getStore()
}

/**
 * Runs the given callback with the additional provided execution context.
 * I.e we can recursively know the method that executed the current method. This gives an idea of
 * who called who during execution.
 *
 * Finally, use {@link getCurrentExecutionContext()} to get the context when required.
 *
 * See the tests for examples of how to use this.
 *
 * @param store.source An identifier that represents the callback. You'll probably want to use the function name.
 * @param store.source If the source is a method, you'll want to include the class name for better context.
 * @param callback The function to run within this execution context. You'll probably want your entire function's code
 *                 to be wrapped in this.
 */
export const withExecutionContext = (context: { source: string; class?: string }, callback: () => any) =>
    executionContext.run(createStore(context), callback)

type ExecutionContextStore = {
    /**
     * The stringified representation of the call stack.
     *
     * Example: "ClassA#methodA,methodB:ClassB#methodY,methodZ"
     *
     * This translates to:
     * ClassA.methodA -> ClassA.methodB -> ClassB.methodY -> ClassB.methodZ
     *
     * NOTE: Methods that do not implement the execution context by using {@link withExecutionContext}
     *       will not be included in the stack.
     */
    sourceStack: string
    class?: string
}

/**
 * Creates an {@link ExecutionContextStore} from the given context.
 *
 * We need this since the new store is composed of the previous store + new context.
 * And instead of requiring the caller to manually do this, we abstract it away here.
 */
function createStore(context: { source: string; class?: string }): ExecutionContextStore {
    const prevStore = getCurrentExecutionContext()

    const prevClass = prevStore?.class
    const newClass = context.class

    let updatedStack: string
    if (prevStore && prevClass === newClass) {
        // The name is from the same class, so we don't need to add the class since it already exists
        updatedStack = `${prevStore.sourceStack},${context.source}`
    } else {
        // The name may be in a new class, so start a new subsection, adding the new class if it exists.
        updatedStack = `${prevStore ? prevStore.sourceStack + ':' : ''}${newClass ? newClass + '#' : ''}${context.source}`
    }
    return {
        sourceStack: updatedStack,
        class: newClass,
    }
}

/**
 * Enables adding execution context to a callback. I.e it knows the method
 * that executed the current method, recursively. This will allow us to get an idea of
 * who called who during execution.
 *
 * This is a simple wrapper around {@link AsyncLocalStorage} which handles the
 * complexities of switching contexts in async code execution. During `await` it is possible
 * for the context to change, and if not handled correctly, incorrect values can be used
 * from the context due to race conditions.
 *
 */
class ExecutionContext extends AsyncLocalStorage<ExecutionContextStore> {}
const executionContext = new ExecutionContext()

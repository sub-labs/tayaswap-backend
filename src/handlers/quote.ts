import { error } from '@/responses'
import { type IPairData, getPools } from '@/services'
import {
  type AppContext,
  ERROR_ADDRESS,
  ERROR_MULTIPLE_AMOUNT,
  ERROR_NON_VALID_TOKEN,
  ERROR_NO_AMOUNT,
  ERROR_TOKENS_EQUAL
} from '@/types'
import { OpenAPIRoute } from 'chanfana'
import { isAddress, parseUnits } from 'viem'
import { z } from 'zod'

function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  const feeNumerator = 997n

  const feeDenom = 1000n

  const amountInWithFee = amountIn * feeNumerator

  const numerator = amountInWithFee * reserveOut

  const denominator = reserveIn * feeDenom + amountInWithFee

  return numerator / denominator
}

async function findBestRoute(
  inputAmount: bigint,
  tokenIn: string,
  tokenOut: string,
  pools: IPairData[]
): Promise<{ route: string[]; output: bigint; priceImpact: number }> {
  if (inputAmount === 0n) return { route: [], output: 0n, priceImpact: 0 }

  function existsPool(tokenA: string, tokenB: string): boolean {
    for (let i = 0; i < pools.length; i++) {
      const p = pools[i]
      if (
        (p.token0.id.toLowerCase() === tokenA.toLowerCase() && p.token1.id.toLowerCase() === tokenB.toLowerCase()) ||
        (p.token0.id.toLowerCase() === tokenB.toLowerCase() && p.token1.id.toLowerCase() === tokenA.toLowerCase())
      ) {
        return true
      }
    }
    return false
  }

  const routes: string[][] = []

  if (existsPool(tokenIn, tokenOut)) {
    routes.push([tokenIn, tokenOut])
  }

  const candidateSet = new Set<string>()
  for (let i = 0; i < pools.length; i++) {
    candidateSet.add(pools[i].token0.id)
    candidateSet.add(pools[i].token1.id)
  }
  candidateSet.delete(tokenIn)
  candidateSet.delete(tokenOut)

  const candidates = Array.from(candidateSet)

  for (let i = 0; i < candidates.length; i++) {
    const x = candidates[i]
    if (existsPool(tokenIn, x) && existsPool(x, tokenOut)) {
      routes.push([tokenIn, x, tokenOut])
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const x = candidates[i]
      const y = candidates[j]
      if (existsPool(tokenIn, x) && existsPool(x, y) && existsPool(y, tokenOut)) {
        routes.push([tokenIn, x, y, tokenOut])
      }
      if (existsPool(tokenIn, y) && existsPool(y, x) && existsPool(x, tokenOut)) {
        routes.push([tokenIn, y, x, tokenOut])
      }
    }
  }

  function getPool(tokenA: string, tokenB: string): IPairData | undefined {
    return pools.find(
      (p) =>
        (p.token0.id.toLowerCase() === tokenA.toLowerCase() && p.token1.id.toLowerCase() === tokenB.toLowerCase()) ||
        (p.token0.id.toLowerCase() === tokenB.toLowerCase() && p.token1.id.toLowerCase() === tokenA.toLowerCase())
    )
  }

  let bestRoute: string[] = []
  let bestOutput = 0n

  for (const route of routes) {
    let amount = inputAmount
    let valid = true

    for (let i = 0; i < route.length - 1; i++) {
      const tokenA = route[i]

      const tokenB = route[i + 1]

      const pool = getPool(tokenA, tokenB)

      if (!pool) {
        valid = false
        break
      }

      let reserveIn: bigint
      let reserveOut: bigint

      if (pool.token0.id === tokenIn) {
        reserveIn = BigInt(pool.reserve0)
        reserveOut = BigInt(pool.reserve1)
      } else {
        reserveIn = BigInt(pool.reserve1)
        reserveOut = BigInt(pool.reserve0)
      }

      amount = getAmountOut(inputAmount, reserveIn, reserveOut)
    }

    if (!valid) continue

    if (amount > bestOutput) {
      bestOutput = amount
      bestRoute = route
    }
  }

  let idealOutput = inputAmount

  for (let i = 0; i < bestRoute.length - 1; i++) {
    const pool = getPool(bestRoute[i], bestRoute[i + 1])
    if (!pool) continue

    let reserveIn: bigint
    let reserveOut: bigint

    if (bestRoute[i].toLowerCase() === pool.token0.id.toLowerCase()) {
      reserveIn = parseUnits(pool.reserve0, Number(pool.token0.decimals))
      reserveOut = parseUnits(pool.reserve1, Number(pool.token1.decimals))
    } else {
      reserveIn = parseUnits(pool.reserve1, Number(pool.token1.decimals))
      reserveOut = parseUnits(pool.reserve0, Number(pool.token0.decimals))
    }

    idealOutput = (idealOutput * reserveOut) / reserveIn
  }

  const priceImpact = idealOutput > 0n ? Number(idealOutput - bestOutput) / Number(idealOutput) : 0

  const totalSlippageBips = Math.floor(priceImpact * 10000)

  const minOutput = (bestOutput * BigInt(10000 - totalSlippageBips)) / 10000n

  return { route: bestRoute, output: minOutput, priceImpact }
}

export class GetQuote extends OpenAPIRoute {
  schema = {
    request: {
      query: z.object({
        fromToken: z.string().describe('The address of the token the user wants to sell.'),
        toToken: z.string().describe('The address of the token the user wants to receive.'),
        fromAmount: z
          .string()
          .optional()
          .describe(
            'The amount of tokens the user wants to sell. Either fromAmount or toAmount must be specified, but not both.'
          ),
        toAmount: z
          .string()
          .optional()
          .describe(
            'The amount of tokens the user wants to receive. Either toAmount or fromAmount must be specified, but not both.'
          )
      })
    },
    response: {
      '200': {
        success: z.boolean().describe('Indicates whether the request was successful.'),
        error: z.string().optional().describe('Error message if the request failed.'),
        quote: z
          .string()
          .optional()
          .describe(
            'The amount of tokens received for the given fromToken, toToken, and specified fromAmount or toAmount.'
          ),
        route: z
          .array(z.string())
          .optional()
          .describe('Optimal trading path (token addresses) for the requested trade.')
      }
    },
    description: 'Returns the quote and optimal trading path for exchanging a specified amount of tokens.',
    tags: ['Quote']
  }

  async handle(context: AppContext) {
    let {
      query: { fromToken, fromAmount, toToken, toAmount }
    } = await this.getValidatedData<typeof this.schema>()

    fromToken = fromToken.toLowerCase()
    toToken = toToken.toLowerCase()

    if (!fromAmount && !toAmount) {
      return error(context, ERROR_NO_AMOUNT)
    }

    if (fromAmount && toAmount) {
      return error(context, ERROR_MULTIPLE_AMOUNT)
    }

    if (fromToken === toToken) {
      return error(context, ERROR_TOKENS_EQUAL)
    }

    if (!isAddress(fromToken)) {
      return error(context, ERROR_ADDRESS('fromToken'))
    }

    if (!isAddress(toToken)) {
      return error(context, ERROR_ADDRESS('toToken'))
    }

    const pools = await getPools(context)

    const tokens = Array.from(
      pools.reduce((set, pair) => {
        set.add(pair.token0.id.toLowerCase())
        set.add(pair.token1.id.toLowerCase())
        return set
      }, new Set<string>())
    )

    if (!tokens.includes(fromToken)) {
      return error(context, ERROR_NON_VALID_TOKEN('fromToken'))
    }

    if (!tokens.includes(toToken)) {
      return error(context, ERROR_NON_VALID_TOKEN('toToken'))
    }

    return context.json({
      success: true
    })
  }
}

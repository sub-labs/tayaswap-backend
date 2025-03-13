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
import { isAddress } from 'viem'
import { z } from 'zod'

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

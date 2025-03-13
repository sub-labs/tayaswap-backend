import { error } from '@/responses'
import { getPools } from '@/services'
import { type AppContext, ERROR_ADDRESS, ERROR_MULTIPLE_AMOUNT, ERROR_NO_AMOUNT } from '@/types'
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
    const data = await this.getValidatedData<typeof this.schema>()

    if (!data.query.fromAmount && !data.query.toAmount) {
      return error(context, ERROR_NO_AMOUNT)
    }

    if (data.query.fromAmount && data.query.toAmount) {
      return error(context, ERROR_MULTIPLE_AMOUNT)
    }

    if (!isAddress(data.query.fromToken)) {
      return error(context, ERROR_ADDRESS('fromToken'))
    }

    if (!isAddress(data.query.toToken)) {
      return error(context, ERROR_ADDRESS('toToken'))
    }

    const pools = await getPools(context)
    console.log(pools)

    return context.json({
      success: true
    })
  }
}

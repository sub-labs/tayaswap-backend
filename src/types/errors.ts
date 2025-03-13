export const ERROR_NO_AMOUNT = 'The quote request requires an amount; neither "fromAmount" nor "toAmount" was provided.'

export const ERROR_MULTIPLE_AMOUNT = 'The quote request requires either "fromAmount" or "toAmount", but not both.'

export const ERROR_ADDRESS = (token: 'fromToken' | 'toToken') => `The "${token}" address is invalid`

export const ERROR_TOKENS_EQUAL = 'The "fromToken" and "toToken" parameters cannot be the same.'

export const ERROR_NON_VALID_TOKEN = (token: 'fromToken' | 'toToken') => `The "${token}" is not a valid token address.`

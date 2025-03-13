export const ERROR_NO_AMOUNT = 'The quote request requires an amount; neither "fromAmount" nor "toAmount" was provided.'

export const ERROR_MULTIPLE_AMOUNT = 'The quote request requires either "fromAmount" or "toAmount", but not both.'

export const ERROR_ADDRESS = (token: 'fromToken' | 'toToken') => `The "${token}" address is invalid`

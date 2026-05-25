type PoolType$9 = 'GYRO';
type Gyro2CLPImmutable = {
    sqrtAlpha: bigint;
    sqrtBeta: bigint;
};
type Gyro2CLPState = BasePoolState & {
    poolType: PoolType$9;
} & Gyro2CLPImmutable;

declare function calculateInvariant(balances: bigint[], sqrtAlpha: bigint, sqrtBeta: bigint, rounding: Rounding): bigint;
/**
 * @dev Computes how many tokens can be taken out of a pool if `amountIn' are sent, given current balances.
 *   balanceIn = existing balance of input token
 *   balanceOut = existing balance of requested output token
 *   virtualParamIn = virtual reserve offset for input token
 *   virtualParamOut = virtual reserve offset for output token
 *   Offsets are L/sqrt(beta) and L*sqrt(alpha) depending on what the `in' and `out' tokens are respectively
 *   Note signs are changed compared to Prop. 4 in Section 2.2.4 Trade (Swap) Execution to account for dy < 0
 *
 *   The virtualOffset argument depends on the computed invariant. We add a very small margin to ensure that
 *   potential small errors are not to the detriment of the pool.
 *
 *   There is a corresponding function in the 3CLP, except that there we allow two different virtual "in" and
 *   "out" assets.
 *   SOMEDAY: This could be made literally the same function in the pool math library.
 */
declare function calcOutGivenIn(balanceIn: bigint, balanceOut: bigint, amountIn: bigint, virtualOffsetIn: bigint, virtualOffsetOut: bigint): bigint;
/**
 * @dev Computes how many tokens must be sent to a pool in order to take `amountOut`, given current balances.
 * See also _calcOutGivenIn(). Adapted for negative values.
 */
declare function calcInGivenOut(balanceIn: bigint, balanceOut: bigint, amountOut: bigint, virtualOffsetIn: bigint, virtualOffsetOut: bigint): bigint;
declare function calculateVirtualParameter0(invariant: bigint, _sqrtBeta: bigint, rounding: Rounding): bigint;
declare function calculateVirtualParameter1(invariant: bigint, _sqrtAlpha: bigint, rounding: Rounding): bigint;

declare class Gyro2CLP implements PoolBase {
    _sqrtAlpha: bigint;
    _sqrtBeta: bigint;
    constructor(poolState: Gyro2CLPImmutable);
    getMaximumInvariantRatio(): bigint;
    getMinimumInvariantRatio(): bigint;
    /**
     * Returns the max amount that can be swapped in relation to the swapKind.
     * @param maxSwapParams
     * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
     */
    getMaxSwapAmount(maxSwapParams: MaxSwapParams): bigint;
    getMaxSingleTokenAddAmount(): bigint;
    getMaxSingleTokenRemoveAmount(maxRemoveParams: MaxSingleTokenRemoveParams): bigint;
    onSwap(swapParams: SwapParams): bigint;
    computeInvariant(balancesLiveScaled18: bigint[], rounding: Rounding): bigint;
    computeBalance(balancesLiveScaled18: bigint[], tokenInIndex: number, invariantRatio: bigint): bigint;
    /**
     * @notice Return the virtual offsets of each token of the 2CLP pool.
     * @dev The 2CLP invariant is defined as `L=(x+a)(y+b)`. "x" and "y" are the real balances, and "a" and "b" are
     * offsets to concentrate the liquidity of the pool. The sum of real balance and offset is known as
     * "virtual balance". Here we return the offsets a and b.
     */
    _getVirtualOffsets(balanceTokenInScaled18: bigint, balanceTokenOutScaled18: bigint, tokenInIsToken0: boolean): {
        virtualBalanceIn: bigint;
        virtualBalanceOut: bigint;
    };
}

type PoolType$8 = 'GYROE';
type GyroECLPImmutable = {
    paramsAlpha: bigint;
    paramsBeta: bigint;
    paramsC: bigint;
    paramsS: bigint;
    paramsLambda: bigint;
    tauAlphaX: bigint;
    tauAlphaY: bigint;
    tauBetaX: bigint;
    tauBetaY: bigint;
    u: bigint;
    v: bigint;
    w: bigint;
    z: bigint;
    dSq: bigint;
};
type GyroECLPState = BasePoolState & {
    poolType: PoolType$8;
} & GyroECLPImmutable;

interface Vector2 {
    x: bigint;
    y: bigint;
}
interface EclpParams {
    alpha: bigint;
    beta: bigint;
    c: bigint;
    s: bigint;
    lambda: bigint;
}
interface DerivedEclpParams {
    tauAlpha: Vector2;
    tauBeta: Vector2;
    u: bigint;
    v: bigint;
    w: bigint;
    z: bigint;
    dSq: bigint;
}
declare class GyroECLPMath {
    static readonly _ONEHALF: bigint;
    static readonly _ONE: bigint;
    static readonly _ONE_XP: bigint;
    static readonly _ROTATION_VECTOR_NORM_ACCURACY: bigint;
    static readonly _MAX_STRETCH_FACTOR: bigint;
    static readonly _DERIVED_TAU_NORM_ACCURACY_XP: bigint;
    static readonly _MAX_INV_INVARIANT_DENOMINATOR_XP: bigint;
    static readonly _DERIVED_DSQ_NORM_ACCURACY_XP: bigint;
    static readonly _MAX_BALANCES: bigint;
    static readonly _MAX_INVARIANT: bigint;
    static readonly MIN_INVARIANT_RATIO: bigint;
    static readonly MAX_INVARIANT_RATIO: bigint;
    static validateParams(params: EclpParams): void;
    static validateDerivedParams(params: EclpParams, derived: DerivedEclpParams): void;
    static scalarProd(t1: Vector2, t2: Vector2): bigint;
    static scalarProdXp(t1: Vector2, t2: Vector2): bigint;
    static mulA(params: EclpParams, tp: Vector2): Vector2;
    static virtualOffset0(p: EclpParams, d: DerivedEclpParams, r: Vector2): bigint;
    static virtualOffset1(p: EclpParams, d: DerivedEclpParams, r: Vector2): bigint;
    static maxBalances0(p: EclpParams, d: DerivedEclpParams, r: Vector2): bigint;
    static maxBalances1(p: EclpParams, d: DerivedEclpParams, r: Vector2): bigint;
    static calcAtAChi(x: bigint, y: bigint, p: EclpParams, d: DerivedEclpParams): bigint;
    static calcAChiAChiInXp(p: EclpParams, d: DerivedEclpParams): bigint;
    static calculateInvariantWithError(balances: bigint[], params: EclpParams, derived: DerivedEclpParams): [bigint, bigint];
    static calcMinAtxAChiySqPlusAtxSq(x: bigint, y: bigint, p: EclpParams, d: DerivedEclpParams): bigint;
    static calc2AtxAtyAChixAChiy(x: bigint, y: bigint, p: EclpParams, d: DerivedEclpParams): bigint;
    static calcMinAtyAChixSqPlusAtySq(x: bigint, y: bigint, p: EclpParams, d: DerivedEclpParams): bigint;
    static calcInvariantSqrt(x: bigint, y: bigint, p: EclpParams, d: DerivedEclpParams): [bigint, bigint];
    static calcSpotPrice0in1(balances: bigint[], params: EclpParams, derived: DerivedEclpParams, invariant: bigint): bigint;
    static checkAssetBounds(params: EclpParams, derived: DerivedEclpParams, invariant: Vector2, newBal: bigint, assetIndex: number): void;
    static calcOutGivenIn(balances: bigint[], amountIn: bigint, tokenInIsToken0: boolean, params: EclpParams, derived: DerivedEclpParams, invariant: Vector2): bigint;
    static calcInGivenOut(balances: bigint[], amountOut: bigint, tokenInIsToken0: boolean, params: EclpParams, derived: DerivedEclpParams, invariant: Vector2): bigint;
    static solveQuadraticSwap(lambda: bigint, x: bigint, s: bigint, c: bigint, r: Vector2, ab: Vector2, tauBeta: Vector2, dSq: bigint): bigint;
    static calcXpXpDivLambdaLambda(x: bigint, r: Vector2, lambda: bigint, s: bigint, c: bigint, tauBeta: Vector2, dSq: bigint): bigint;
    static calcYGivenX(x: bigint, params: EclpParams, d: DerivedEclpParams, r: Vector2): bigint;
    static calcXGivenY(y: bigint, params: EclpParams, d: DerivedEclpParams, r: Vector2): bigint;
}

type PoolParams = {
    eclpParams: EclpParams;
    derivedECLPParams: DerivedEclpParams;
};
declare class GyroECLP implements PoolBase {
    poolParams: PoolParams;
    constructor(poolState: GyroECLPImmutable);
    getMaximumInvariantRatio(): bigint;
    getMinimumInvariantRatio(): bigint;
    /**
     * Returns the max amount that can be swapped in relation to the swapKind.
     * @param maxSwapParams
     * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
     */
    getMaxSwapAmount(maxSwapParams: MaxSwapParams): bigint;
    getMaxSingleTokenAddAmount(): bigint;
    getMaxSingleTokenRemoveAmount(maxRemoveParams: MaxSingleTokenRemoveParams): bigint;
    onSwap(swapParams: SwapParams): bigint;
    computeInvariant(balancesLiveScaled18: bigint[], rounding: Rounding): bigint;
    computeBalance(balancesLiveScaled18: bigint[], tokenInIndex: number, invariantRatio: bigint): bigint;
}

type PoolType$7 = 'WEIGHTED';
type WeightedImmutable = {
    weights: bigint[];
};
type WeightedState = BasePoolState & {
    poolType: PoolType$7;
} & WeightedImmutable;

declare const _MIN_WEIGHT: bigint;
declare const _MAX_IN_RATIO: bigint;
declare const _MAX_OUT_RATIO: bigint;
declare const _MAX_INVARIANT_RATIO: bigint;
declare const _MIN_INVARIANT_RATIO: bigint;
/**
 * @notice Compute the invariant, rounding down.
 * @dev The invariant functions are called by the Vault during various liquidity operations, and require a specific
 * rounding direction in order to ensure safety (i.e., that the final result is always rounded in favor of the
 * protocol. The invariant (i.e., all token balances) must always be greater than 0, or it will revert.
 *
 * @param normalizedWeights The pool token weights, sorted in token registration order
 * @param balances The pool token balances, sorted in token registration order
 * @return invariant The invariant, rounded down
 */
declare const _computeInvariantDown: (normalizedWeights: bigint[], balances: bigint[]) => bigint;
/**
 * @notice Compute the invariant, rounding up.
 * @dev The invariant functions are called by the Vault during various liquidity operations, and require a specific
 * rounding direction in order to ensure safety (i.e., that the final result is always rounded in favor of the
 * protocol. The invariant (i.e., all token balances) must always be greater than 0, or it will revert.
 *
 * @param normalizedWeights The pool token weights, sorted in token registration order
 * @param balances The pool token balances, sorted in token registration order
 * @return invariant The invariant, rounded up
 */
declare const _computeInvariantUp: (normalizedWeights: bigint[], balances: bigint[]) => bigint;
declare const _computeBalanceOutGivenInvariant: (currentBalance: bigint, weight: bigint, invariantRatio: bigint) => bigint;
declare const _computeOutGivenExactIn: (balanceIn: bigint, weightIn: bigint, balanceOut: bigint, weightOut: bigint, amountIn: bigint) => bigint;
declare const _computeInGivenExactOut: (balanceIn: bigint, weightIn: bigint, balanceOut: bigint, weightOut: bigint, amountOut: bigint) => bigint;

declare class Weighted implements PoolBase {
    normalizedWeights: bigint[];
    constructor(poolState: {
        weights: bigint[];
    });
    getMaximumInvariantRatio(): bigint;
    getMinimumInvariantRatio(): bigint;
    /**
     * Returns the max amount that can be swapped in relation to the swapKind.
     * @param maxSwapParams
     * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
     */
    getMaxSwapAmount(maxSwapParams: MaxSwapParams): bigint;
    getMaxSingleTokenAddAmount(): bigint;
    getMaxSingleTokenRemoveAmount(maxRemoveParams: MaxSingleTokenRemoveParams): bigint;
    onSwap(swapParams: SwapParams): bigint;
    computeInvariant(balancesLiveScaled18: bigint[], rounding: Rounding): bigint;
    computeBalance(balancesLiveScaled18: bigint[], tokenInIndex: number, invariantRatio: bigint): bigint;
}

type PoolType$6 = 'RECLAMM';
type ReClammMutable = {
    lastVirtualBalances: bigint[];
    dailyPriceShiftBase: bigint;
    lastTimestamp: bigint;
    currentTimestamp: bigint;
    centerednessMargin: bigint;
    startFourthRootPriceRatio: bigint;
    endFourthRootPriceRatio: bigint;
    priceRatioUpdateStartTime: bigint;
    priceRatioUpdateEndTime: bigint;
};
type ReClammState = BasePoolState & {
    poolType: PoolType$6;
} & ReClammMutable;

declare class ReClamm implements PoolBase {
    reClammState: ReClammMutable;
    constructor(reClammState: ReClammMutable);
    getMaximumInvariantRatio(): bigint;
    getMinimumInvariantRatio(): bigint;
    /**
     * Returns the max amount that can be swapped in relation to the swapKind.
     * @param maxSwapParams
     * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
     */
    getMaxSwapAmount(maxSwapParams: MaxSwapParams): bigint;
    getMaxSingleTokenAddAmount(): bigint;
    getMaxSingleTokenRemoveAmount(): bigint;
    onSwap(swapParams: SwapParams): bigint;
    computeInvariant(): bigint;
    computeBalance(): bigint;
    _computeCurrentVirtualBalances(balancesScaled18: bigint[]): {
        currentVirtualBalanceA: bigint;
        currentVirtualBalanceB: bigint;
        changed: boolean;
    };
}

type PoolType$5 = 'QUANT_AMM_WEIGHTED';
type QuantAmmMutable = {
    firstFourWeightsAndMultipliers: bigint[];
    secondFourWeightsAndMultipliers: bigint[];
    lastUpdateTime: bigint;
    lastInteropTime: bigint;
    currentTimestamp: bigint;
};
type QuantAmmImmutable = {
    maxTradeSizeRatio: bigint;
};
type QuantAmmState = BasePoolState & {
    poolType: PoolType$5;
} & QuantAmmMutable & QuantAmmImmutable;

/**
 * @notice Calculate the current block weight based on time interpolation
 * @param weight The base weight
 * @param multiplier The weight multiplier
 * @param timeSinceLastUpdate The time since the last weight update
 * @return The interpolated weight
 */
declare const calculateBlockNormalisedWeight: (weight: bigint, multiplier: bigint, timeSinceLastUpdate: bigint) => bigint;
/**
 * Both functions below are simplified versions of the SC implementation.
 * They extract weights and multipliers from mutable data fecthed on-chain, which
 * are packed and stored in 256-bit words for storage efficiency, but here can
 * be unpacked into separate weights and multipliers arrays.
 */
declare const getFirstFourWeightsAndMultipliers: (tokens: string[], firstFourWeightsAndMultipliers: bigint[]) => {
    weights: bigint[];
    multipliers: bigint[];
};
declare const getSecondFourWeightsAndMultipliers: (tokens: string[], secondFourWeightsAndMultipliers: bigint[]) => {
    weights: bigint[];
    multipliers: bigint[];
};

declare class QuantAmm implements PoolBase {
    private quantAmmState;
    private weights;
    private multipliers;
    constructor(quantAmmState: QuantAmmState);
    getMaximumInvariantRatio(): bigint;
    getMinimumInvariantRatio(): bigint;
    getMaxSwapAmount(maxSwapParams: MaxSwapParams): bigint;
    getMaxSingleTokenAddAmount(): bigint;
    getMaxSingleTokenRemoveAmount(maxRemoveParams: MaxSingleTokenRemoveParams): bigint;
    onSwap(swapParams: SwapParams): bigint;
    computeInvariant(balancesLiveScaled18: bigint[], rounding: Rounding): bigint;
    computeBalance(balancesLiveScaled18: bigint[], tokenInIndex: number, invariantRatio: bigint): bigint;
    private _getNormalizedWeightPair;
    private _getNormalizedWeights;
}

type PoolType$4 = 'FIXED_PRICE_LBP';
type FixedPriceLBPImmutable = {
    projectTokenIndex: number;
    reserveTokenIndex: number;
    projectTokenRate: bigint;
    startTime: bigint;
    endTime: bigint;
};
type FixedPriceLBPMutable = {
    isSwapEnabled: boolean;
    currentTimestamp: bigint;
};
type FixedPriceLBPState = BasePoolState & {
    poolType: PoolType$4;
} & FixedPriceLBPImmutable & FixedPriceLBPMutable;

declare class FixedPriceLBP implements PoolBase {
    projectTokenIndex: number;
    reserveTokenIndex: number;
    projectTokenRate: bigint;
    isSwapEnabled: boolean;
    constructor(poolState: FixedPriceLBPState);
    getMaximumInvariantRatio(): bigint;
    getMinimumInvariantRatio(): bigint;
    getMaxSwapAmount(maxSwapParams: MaxSwapParams): bigint;
    getMaxSingleTokenAddAmount(): bigint;
    getMaxSingleTokenRemoveAmount(): bigint;
    onSwap(swapParams: SwapParams): bigint;
    computeInvariant(balancesLiveScaled18: bigint[], rounding: Rounding): bigint;
    computeBalance(): bigint;
}

/**
 * State of a pool. Note - rates, fees, totalSupply use scaled 18.
 */
type BasePoolState = {
    poolAddress: string;
    poolType: string;
    tokens: string[];
    scalingFactors: bigint[];
    tokenRates: bigint[];
    balancesLiveScaled18: bigint[];
    swapFee: bigint;
    aggregateSwapFee: bigint;
    totalSupply: bigint;
    supportsUnbalancedLiquidity: boolean;
    hookType?: string;
};
type PoolState = BasePoolState | WeightedState | StableState | GyroECLPState | ReClammState | QuantAmmState | FixedPriceLBPState;
declare enum SwapKind {
    GivenIn = 0,
    GivenOut = 1
}
declare enum Rounding {
    ROUND_UP = 0,
    ROUND_DOWN = 1
}
interface PoolBase {
    getMaxSwapAmount(maxSwapParams: MaxSwapParams): bigint;
    getMaxSingleTokenRemoveAmount(maxRemoveParams: MaxSingleTokenRemoveParams): bigint;
    getMaxSingleTokenAddAmount(): bigint;
    onSwap(swapParams: SwapParams): bigint;
    computeInvariant(balancesLiveScaled18: bigint[], rounding: Rounding): bigint;
    computeBalance(balancesLiveScaled18: bigint[], tokenInIndex: number, invariantRatio: bigint): bigint;
    getMaximumInvariantRatio(): bigint;
    getMinimumInvariantRatio(): bigint;
}
type MaxSwapParams = {
    swapKind: SwapKind;
    balancesLiveScaled18: bigint[];
    tokenRates: bigint[];
    scalingFactors: bigint[];
    indexIn: number;
    indexOut: number;
};
type MaxSingleTokenRemoveParams = {
    isExactIn: boolean;
    totalSupply: bigint;
    tokenOutBalance: bigint;
    tokenOutScalingFactor: bigint;
    tokenOutRate: bigint;
};
type SwapParams = {
    swapKind: SwapKind;
    amountGivenScaled18: bigint;
    balancesLiveScaled18: bigint[];
    indexIn: number;
    indexOut: number;
};
/**
 * User defined input for a swap operation.
 *
 * @property {bigint} amountRaw - Raw amount for swap (e.g. 1USDC=1000000).
 * @property {string} tokenIn - Address of token in.
 * @property {string} tokenOut - Address of token out.
 * @property {SwapKind} swapKind - GivenIn or GivenOut.
 */
type SwapInput = {
    amountRaw: bigint;
    tokenIn: string;
    tokenOut: string;
    swapKind: SwapKind;
};
declare enum AddKind {
    UNBALANCED = 0,
    SINGLE_TOKEN_EXACT_OUT = 1
}
type AddLiquidityInput = {
    pool: string;
    maxAmountsInRaw: bigint[];
    minBptAmountOutRaw: bigint;
    kind: AddKind;
};
declare enum RemoveKind {
    PROPORTIONAL = 0,
    SINGLE_TOKEN_EXACT_IN = 1,
    SINGLE_TOKEN_EXACT_OUT = 2
}
type RemoveLiquidityInput = {
    pool: string;
    minAmountsOutRaw: bigint[];
    maxBptAmountInRaw: bigint;
    kind: RemoveKind;
};

type PoolType$3 = 'STABLE';
type StableMutable = {
    amp: bigint;
};
type StableState = BasePoolState & {
    poolType: PoolType$3;
} & StableMutable;

declare class Stable implements PoolBase {
    amp: bigint;
    constructor(poolState: StableMutable);
    getMaximumInvariantRatio(): bigint;
    getMinimumInvariantRatio(): bigint;
    /**
     * Returns the max amount that can be swapped in relation to the swapKind.
     * @param maxSwapParams
     * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
     */
    getMaxSwapAmount(maxSwapParams: MaxSwapParams): bigint;
    getMaxSingleTokenAddAmount(): bigint;
    getMaxSingleTokenRemoveAmount(maxRemoveParams: MaxSingleTokenRemoveParams): bigint;
    onSwap(swapParams: SwapParams): bigint;
    computeInvariant(balancesLiveScaled18: bigint[], rounding: Rounding): bigint;
    computeBalance(balancesLiveScaled18: bigint[], tokenInIndex: number, invariantRatio: bigint): bigint;
}

type PoolType$2 = 'Buffer';
type BufferMutable = {
    rate: bigint;
    maxDeposit?: bigint;
    maxMint?: bigint;
};
type BufferImmutable = {
    poolAddress: string;
    tokens: string[];
};
/**
 * State of a buffer. Note - rate uses scaled 18.
 */
type BufferState = {
    poolType: PoolType$2;
} & BufferImmutable & BufferMutable;

declare function erc4626BufferWrapOrUnwrap(input: SwapInput, poolState: BufferState): bigint;

type HookStateExitFee = HookStateBase & {
    hookType: 'ExitFee';
    tokens: string[];
    removeLiquidityHookFeePercentage: bigint;
};

type HookStateStableSurge = HookStateBase & {
    hookType: 'StableSurge';
    amp: bigint;
    surgeThresholdPercentage: bigint;
    maxSurgeFeePercentage: bigint;
};

type HookStateAkron = HookStateBase & {
    hookType: 'Akron';
    weights: bigint[];
    minimumSwapFeePercentage: bigint;
};

type HookStateBase = {
    hookType: string;
};
type HookState = HookStateExitFee | HookStateStableSurge | HookStateAkron;
type AfterSwapParams = {
    kind: SwapKind;
    tokenIn: string;
    tokenOut: string;
    amountInScaled18: bigint;
    amountOutScaled18: bigint;
    tokenInBalanceScaled18: bigint;
    tokenOutBalanceScaled18: bigint;
    amountCalculatedScaled18: bigint;
    amountCalculatedRaw: bigint;
    hookState: HookState | unknown;
};
interface HookBase {
    shouldCallComputeDynamicSwapFee: boolean;
    shouldCallBeforeSwap: boolean;
    shouldCallAfterSwap: boolean;
    shouldCallBeforeAddLiquidity: boolean;
    shouldCallAfterAddLiquidity: boolean;
    shouldCallBeforeRemoveLiquidity: boolean;
    shouldCallAfterRemoveLiquidity: boolean;
    enableHookAdjustedAmounts: boolean;
    onBeforeAddLiquidity(kind: AddKind, maxAmountsInScaled18: bigint[], minBptAmountOut: bigint, balancesScaled18: bigint[], hookState: HookState | unknown): {
        success: boolean;
        hookAdjustedBalancesScaled18: bigint[];
    };
    onAfterAddLiquidity(kind: AddKind, amountsInScaled18: bigint[], amountsInRaw: bigint[], bptAmountOut: bigint, balancesScaled18: bigint[], hookState: HookState | unknown): {
        success: boolean;
        hookAdjustedAmountsInRaw: bigint[];
    };
    onBeforeRemoveLiquidity(kind: RemoveKind, maxBptAmountIn: bigint, minAmountsOutScaled18: bigint[], balancesScaled18: bigint[], hookState: HookState | unknown): {
        success: boolean;
        hookAdjustedBalancesScaled18: bigint[];
    };
    onAfterRemoveLiquidity(kind: RemoveKind, bptAmountIn: bigint, amountsOutScaled18: bigint[], amountsOutRaw: bigint[], balancesScaled18: bigint[], hookState: HookState | unknown): {
        success: boolean;
        hookAdjustedAmountsOutRaw: bigint[];
    };
    onBeforeSwap(params: SwapParams & {
        hookState: HookState | unknown;
    }): {
        success: boolean;
        hookAdjustedBalancesScaled18: bigint[];
    };
    onAfterSwap(params: AfterSwapParams): {
        success: boolean;
        hookAdjustedAmountCalculatedRaw: bigint;
    };
    onComputeDynamicSwapFee(params: SwapParams, pool: string, staticSwapFeePercentage: bigint, hookState: HookState | unknown): {
        success: boolean;
        dynamicSwapFee: bigint;
    };
}
type HookClassConstructor = new (..._args: any[]) => HookBase;

type PoolClassConstructor = new (..._args: any[]) => PoolBase;
type PoolClasses = Readonly<Record<string, PoolClassConstructor>>;
type HookClasses = Readonly<Record<string, HookClassConstructor>>;
declare class Vault {
    private readonly poolClasses;
    private readonly hookClasses;
    constructor(config?: {
        customPoolClasses?: PoolClasses;
        customHookClasses?: HookClasses;
    });
    getPool(poolState: PoolState): PoolBase;
    getHook(hookName?: string, hookState?: HookState | unknown): HookBase;
    /**
     * Returns the max amount that can be swapped (in relation to the amount specified by user).
     * @param maxSwapParams
     * @returns Returned amount/scaling is respective to the tokenOut because that’s what we’re taking out of the pool and what limits the swap size.
     */
    getMaxSwapAmount(swapParams: MaxSwapParams, poolState: PoolState): bigint;
    /**
     * Returns the max amount of a single token that can be added to a pool.
     * @param poolState
     * @returns
     */
    getMaxSingleTokenAddAmount(poolState: PoolState): bigint;
    /**
     * Returns the max amount of a single token that can be removed from a pool.
     * @param maxRemoveParams
     * @param poolState
     * @returns
     */
    getMaxSingleTokenRemoveAmount(maxRemoveParams: MaxSingleTokenRemoveParams, poolState: PoolState): bigint;
    /**
     * Calculates the result of a swap.
     *
     * @param swapInput - User defined input for a swap operation, including:
     *   - `amountRaw`: Raw amount for swap (e.g. 1USDC=1000000).
     *   - `tokenIn`: Address of token in.
     *   - `tokenOut`: Address of token out.
     *   - `swapKind`: GivenIn or GivenOut.
     * @param poolState - Pool state that will be used for calculations.
     *   - Note: rates, fees, totalSupply use scaled 18. For detailed information, refer to the `PoolState | BufferState` types.
     * @param hookState - Optional state for any associated hook. Required if pool has a hook enabled.
     *   - Note: Each hook will require its own state data. See `HookState` type for officially supported hook info.
     * @returns The raw result of the swap operation.
     */
    swap(swapInput: SwapInput, poolState: PoolState | BufferState, hookState?: HookState | unknown): bigint;
    /**
     * Calculates the amount of BPT for a given add liquidity operation.
     *
     * @param addLiquidityInput - User defined input for an addLiquidity operation.
     *   - For detailed information refer to the `AddLiquidityInput` type.
     * @param poolState - Pool state that will be used for calculations.
     *   - Note: rates, fees, totalSupply use scaled 18. For detailed information, refer to the `PoolState` type.
     * @param hookState - Optional state for any associated hook. Required if pool has a hook enabled.
     *   - Note: Each hook will require its own state data. See `HookState` type for officially supported hook info.
     * @returns {Object} An object containing the raw input amounts and the calculated raw BPT output amount.
     * @returns {bigint[]} returns.amountsInRaw - An array of raw input amounts in.
     * @returns {bigint} returns.bptAmountOutRaw - The calculated raw BPT output amount.
     */
    addLiquidity(addLiquidityInput: AddLiquidityInput, poolState: PoolState, hookState?: HookState | unknown): {
        amountsInRaw: bigint[];
        bptAmountOutRaw: bigint;
    };
    /**
     * Calculates the token amounts out for a given remove liquidity operation.
     *
     * @param removeLiquidityInput - User defined input for a removeLiquidity operation.
     *   - For detailed information refer to the `RemoveLiquidityInput` type.
     *   - Note: `minAmountsOutRaw` must always contain an amount for all tokens, e.g. for single token remove other tokens must have 0n.
     * @param poolState - Pool state that will be used for calculations.
     *   - Note: rates, fees, totalSupply use scaled 18. For detailed information, refer to the `PoolState` type.
     * @param hookState - Optional state for any associated hook. Required if pool has a hook enabled.
     *   - Note: Each hook will require its own state data. See `HookState` type for officially supported hook info.
     * @returns {Object} An object containing the calculated raw output amounts and the BPT input amount.
     * @returns {bigint[]} returns.amountsOutRaw - An array of calculated raw output amounts.
     * @returns {bigint} returns.bptAmountInRaw - The raw BPT input amount.
     */
    removeLiquidity(removeLiquidityInput: RemoveLiquidityInput, poolState: PoolState, hookState?: HookState | unknown): {
        amountsOutRaw: bigint[];
        bptAmountInRaw: bigint;
    };
    private _computeAndChargeAggregateSwapFees;
    private _getSingleInputIndex;
    /**
     * @dev Same as `toScaled18ApplyRateRoundDown`, but returns a new array, leaving the original intact.
     */
    private _copyToScaled18ApplyRateRoundDownArray;
    /**
     * @dev Same as `toScaled18ApplyRateRoundDown`, but returns a new array, leaving the original intact.
     */
    private _copyToScaled18ApplyRateRoundUpArray;
    private _computeAmountGivenScaled18;
    /**
     * @notice Rounds up a rate informed by a rate provider.
     * @dev Rates calculated by an external rate provider have rounding errors. Intuitively, a rate provider
     * rounds the rate down so the pool math is executed with conservative amounts. However, when upscaling or
     * downscaling the amount out, the rate should be rounded up to make sure the amounts scaled are conservative.
     */
    private _computeRateRoundUp;
    private _ensureValidSwapAmount;
    private _requireUnbalancedLiquidityEnabled;
}

type PoolType$1 = 'RECLAMM_V2';
type ReClammV2Mutable = {
    lastVirtualBalances: bigint[];
    dailyPriceShiftBase: bigint;
    lastTimestamp: bigint;
    currentTimestamp: bigint;
    centerednessMargin: bigint;
    startFourthRootPriceRatio: bigint;
    endFourthRootPriceRatio: bigint;
    priceRatioUpdateStartTime: bigint;
    priceRatioUpdateEndTime: bigint;
};
type ReClammV2State = BasePoolState & {
    poolType: PoolType$1;
} & ReClammV2Mutable;

declare class ReClammV2 implements PoolBase {
    reClammState: ReClammV2Mutable;
    constructor(reClammState: ReClammV2Mutable);
    getMaximumInvariantRatio(): bigint;
    getMinimumInvariantRatio(): bigint;
    /**
     * Returns the max amount that can be swapped in relation to the swapKind.
     * @param maxSwapParams
     * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
     */
    getMaxSwapAmount(maxSwapParams: MaxSwapParams): bigint;
    getMaxSingleTokenAddAmount(): bigint;
    getMaxSingleTokenRemoveAmount(): bigint;
    onSwap(swapParams: SwapParams): bigint;
    computeInvariant(): bigint;
    computeBalance(): bigint;
    _computeCurrentVirtualBalances(balancesScaled18: bigint[]): {
        currentVirtualBalanceA: bigint;
        currentVirtualBalanceB: bigint;
        changed: boolean;
    };
}

type PoolType = 'LIQUIDITY_BOOTSTRAPPING';
type LiquidityBootstrappingState = BasePoolState & {
    poolType: PoolType;
    currentTimestamp: bigint;
} & LiquidityBootstrappingImmutable & LiquidityBootstrappingMutable;
type LiquidityBootstrappingImmutable = {
    projectTokenIndex: number;
    isProjectTokenSwapInBlocked: boolean;
    startWeights: bigint[];
    endWeights: bigint[];
    startTime: bigint;
    endTime: bigint;
};
type LiquidityBootstrappingMutable = {
    isSwapEnabled: boolean;
} & WeightedImmutable;

declare class LiquidityBootstrapping extends Weighted {
    lbpState: LiquidityBootstrappingState;
    constructor(poolState: LiquidityBootstrappingState);
    onSwap(swapParams: SwapParams): bigint;
}

export { AddKind, type AddLiquidityInput, type AfterSwapParams, type BasePoolState, type BufferImmutable, type BufferMutable, type BufferState, type DerivedEclpParams, type EclpParams, FixedPriceLBP, type FixedPriceLBPImmutable, type FixedPriceLBPMutable, type FixedPriceLBPState, Gyro2CLP, type Gyro2CLPImmutable, type Gyro2CLPState, GyroECLP, type GyroECLPImmutable, GyroECLPMath, type GyroECLPState, type HookBase, type HookClassConstructor, type HookClasses, type HookState, type HookStateBase, LiquidityBootstrapping, type LiquidityBootstrappingImmutable, type LiquidityBootstrappingMutable, type LiquidityBootstrappingState, type MaxSingleTokenRemoveParams, type MaxSwapParams, type PoolBase, type PoolState, QuantAmm, type QuantAmmImmutable, type QuantAmmMutable, type QuantAmmState, ReClamm, type ReClammMutable, type ReClammState, ReClammV2, type ReClammV2Mutable, type ReClammV2State, RemoveKind, type RemoveLiquidityInput, Rounding, Stable, type StableMutable, type StableState, type SwapInput, SwapKind, type SwapParams, Vault, type Vector2, Weighted, type WeightedImmutable, type WeightedState, _MAX_INVARIANT_RATIO, _MAX_IN_RATIO, _MAX_OUT_RATIO, _MIN_INVARIANT_RATIO, _MIN_WEIGHT, _computeBalanceOutGivenInvariant, _computeInGivenExactOut, _computeInvariantDown, _computeInvariantUp, _computeOutGivenExactIn, calcInGivenOut, calcOutGivenIn, calculateBlockNormalisedWeight, calculateInvariant, calculateVirtualParameter0, calculateVirtualParameter1, erc4626BufferWrapOrUnwrap, getFirstFourWeightsAndMultipliers, getSecondFourWeightsAndMultipliers };

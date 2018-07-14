import { Breadcrumb, Context, SdkInfo, SentryEvent } from '@sentry/shim';
import { DSN } from './dsn';
import { Backend, Frontend, Options, Scope } from './interfaces';
import { SendStatus } from './status';
/** A class object that can instanciate Backend objects. */
export interface BackendClass<B extends Backend, O extends Options> {
    new (frontend: Frontend<O>): B;
}
/**
 * Base implementation for all JavaScript SDK frontends.
 *
 * Call the constructor with the corresponding backend constructor and options
 * specific to the frontend subclass. To access these options later, use
 * {@link Frontend.getOptions}. Also, the Backend instance is available via
 * {@link Frontend.getBackend}.
 *
 * Subclasses must implement one abstract method: {@link getSdkInfo}. It must
 * return the unique name and the version of the SDK.
 *
 * If a DSN is specified in the options, it will be parsed and stored. Use
 * {@link Frontend.getDSN} to retrieve the DSN at any moment. In case the DSN is
 * invalid, the constructor will throw a {@link SentryException}. Note that
 * without a valid DSN, the SDK will not send any events to Sentry.
 *
 * Before sending an event via the backend, it is passed through
 * {@link FrontendBase.prepareEvent} to add SDK information and scope data
 * (breadcrumbs and context). To add more custom information, override this
 * method and extend the resulting prepared event.
 *
 * To issue automatically created events (e.g. via instrumentation), use
 * {@link Frontend.captureEvent}. It will prepare the event and pass it through
 * the callback lifecycle. To issue auto-breadcrumbs, use
 * {@link Frontend.addBreadcrumb}.
 *
 * @example
 * class NodeFrontend extends FrontendBase<NodeBackend, NodeOptions> {
 *   public constructor(options: NodeOptions) {
 *     super(NodeBackend, options);
 *   }
 *
 *   // ...
 * }
 */
export declare abstract class FrontendBase<B extends Backend, O extends Options> implements Frontend<O> {
    /**
     * The backend used to physically interact in the enviornment. Usually, this
     * will correspond to the frontend. When composing SDKs, however, the Backend
     * from the root SDK will be used.
     */
    private readonly backend;
    /** Options passed to the SDK. */
    private readonly options;
    /**
     * The client DSN, if specified in options. Without this DSN, the SDK will be
     * disabled.
     */
    private readonly dsn?;
    /**
     * A scope instance containing breadcrumbs and context, used if none is
     * specified to the public methods. This is specifically used in standalone
     * mode, when the Frontend is directly instanciated by the user.
     */
    private readonly internalScope;
    /**
     * Stores whether installation has been performed and was successful. Before
     * installing, this is undefined. Then it contains the success state.
     */
    private installed?;
    /**
     * Initializes this frontend instance.
     *
     * @param backendClass A constructor function to create the backend.
     * @param options Options for the frontend.
     */
    protected constructor(backendClass: BackendClass<B, O>, options: O);
    /**
     * @inheritDoc
     */
    install(): boolean;
    /**
     * @inheritDoc
     */
    captureException(exception: any, scope?: Scope): Promise<void>;
    /**
     * @inheritDoc
     */
    captureMessage(message: string, scope?: Scope): Promise<void>;
    /**
     * @inheritDoc
     */
    captureEvent(event: SentryEvent, scope?: Scope): Promise<void>;
    /**
     * @inheritDoc
     */
    addBreadcrumb(breadcrumb: Breadcrumb, scope?: Scope): Promise<void>;
    /**
     * @inheritDoc
     */
    getDSN(): DSN | undefined;
    /**
     * @inheritDoc
     */
    getOptions(): O;
    /**
     * @inheritDoc
     */
    setContext(nextContext: Context, scope?: Scope): Promise<void>;
    /**
     * @inheritDoc
     */
    getInitialScope(): Scope;
    /** Returns the current used SDK version and name. */
    protected abstract getSdkInfo(): SdkInfo;
    /** Returns the current internal scope of this instance. */
    protected getInternalScope(): Scope;
    /** Returns the current backend. */
    protected getBackend(): B;
    /** Determines whether this SDK is enabled and a valid DSN is present. */
    protected isEnabled(): boolean;
    /**
     * Adds common information to events.
     *
     * The information includes release and environment from `options`, SDK
     * information returned by {@link FrontendBase.getSdkInfo}, as well as
     * breadcrumbs and context (extra, tags and user) from the scope.
     *
     * Information that is already present in the event is never overwritten. For
     * nested objects, such as the context, keys are merged.
     *
     * @param event The original event.
     * @param scope A scope containing event metadata.
     * @returns A new event with more information.
     */
    protected prepareEvent(event: SentryEvent, scope: Scope): Promise<SentryEvent>;
    /**
     * Processes an event (either error or message) and sends it to Sentry.
     *
     * This also adds breadcrumbs and context information to the event. However,
     * platform specific meta data (such as the User's IP address) must be added
     * by the SDK implementor.
     *
     * The returned event status offers clues to whether the event was sent to
     * Sentry and accepted there. If the {@link Options.shouldSend} hook returns
     * `false`, the status will be {@link SendStatus.Skipped}. If the rate limit
     * was exceeded, the status will be {@link SendStatus.RateLimit}.
     *
     * @param event The event to send to Sentry.
     * @param scope A scope containing event metadata.
     * @param send A function to actually send the event.
     * @returns A Promise that resolves with the event status.
     */
    protected processEvent(event: SentryEvent, scope: Scope, send: (finalEvent: SentryEvent) => Promise<number>): Promise<SendStatus>;
}

import {
  Component,
  Element,
  Event,
  EventEmitter,
  Host,
  Listen,
  Prop,
  State,
  Watch,
  Method,
  h,
} from "@stencil/core";

import {
  IcAutocompleteTypes,
  IcAutocorrectStates,
  IcThemeForegroundEnum,
  IcMenuOption,
} from "../../utils/types";
import {
  debounceEvent,
  getInputDescribedByText,
  renderHiddenInput,
  handleHiddenFormButtonClick,
  getLabelFromValue,
  onComponentRequiredPropUndefined,
  getFilteredMenuOptions,
} from "../../utils/helpers";
import { IcSearchBarBlurEventDetail } from "./ic-search-bar.types";
import { IcValueEventDetail, IcBlurEventDetail } from "../../interface";
import {
  IcMenuChangeEventDetail,
  IcOptionSelectEventDetail,
} from "../ic-menu/ic-menu.types";

import clearIcon from "../../assets/clear-icon.svg";
import searchIcon from "../../assets/search-icon.svg";

let inputIds = 0;

@Component({
  tag: "ic-search-bar",
  styleUrl: "ic-search-bar.css",
  shadow: true,
})
export class SearchBar {
  @Element() el: HTMLIcSearchBarElement;

  private inputId = `ic-search-bar-input-${inputIds++}`;
  private inputEl: HTMLIcTextFieldElement;

  private menuId = `${this.inputId}-menu`;
  private searchSubmitButton: HTMLIcButtonElement;
  private menu: HTMLIcMenuElement;
  private menuCloseFromMenuChangeEvent: boolean = false;

  private anchorEl: HTMLElement;
  private truncateValue = false;

  private assistiveHintEl: HTMLSpanElement = null;
  private preventSubmit: boolean = false;

  /**
   * Provide a label for the input.
   */
  @Prop() label!: string;

  /**
   * Specify if the input requires a value.
   */
  @Prop() required?: boolean = false;
  /**
   * Specify whether the input is disabled.
   */
  @Prop() disabled?: boolean = false;

  /**
   * Specify whether the input is read only.
   */
  @Prop() readonly?: boolean = false;

  /**
   * Provide a placeholder value to display.
   */
  @Prop() placeholder?: string = "Search";

  /**
   * Specify whether the component fills the full width of the container.
   * If true, this overrides the --input-width css prop.
   */
  @Prop() fullWidth?: boolean = false;

  /**
   * Specify whether to disable the built in filtering. For example, if options will already be filtered from external source.
   * If true, all options provided will be displayed.
   */
  @Prop() disableFilter?: boolean = false;

  /**
   * Hides the label and applies the required label value as an aria-label.
   */
  @Prop() hideLabel?: boolean = false;

  /**
   * Provide helper text to display additional field guidance.
   */
  @Prop() helperText?: string = "";

  /**
   * Specify whether small styling is to be applied to the element.
   */
  @Prop() small?: boolean = false;

  /**
   * Value of Search input.
   */
  @Prop({ reflect: true, mutable: true }) value: string = "";

  /**
   * Indicates whether and how the text value should be automatically capitalized as it is entered/edited by the user.
   * Available options: "off", "none", "on", "sentences", "words", "characters".
   */
  @Prop() autocapitalize = "off";

  /**
   * Indicates whether the value of the control can be automatically completed by the browser.
   */
  @Prop() autocomplete?: IcAutocompleteTypes = "off";

  /**
   * Whether auto correction should be enabled when the user is entering/editing the text value.
   */
  @Prop() autocorrect?: IcAutocorrectStates = "off";

  /**
   * This Boolean attribute lets you specify that a form control should have input focus when the page loads.
   */
  @Prop() autofocus = false;

  /**
   * Set the amount of time, in milliseconds, to wait to trigger the `icChange` event after each keystroke.
   */
  @Prop({ mutable: true }) debounce?: number = 0;

  @Watch("debounce")
  private debounceChanged() {
    this.icChange = debounceEvent(this.icChange, this.debounce);
  }

  /**
   * The name of the control, which is submitted with the form data.
   */
  @Prop() name: string = this.inputId;

  /**
   * If `true`, the element will have its spelling and grammar checked.
   */
  @Prop() spellcheck: boolean = false;
  /**
   * Provide the suggested search options
   */
  @Prop() options?: IcMenuOption[] = [];

  @Watch("options")
  watchOptionsHandler(newOptions: IcMenuOption[]): void {
    if (this.disableFilter) {
      this.filteredOptions = newOptions;
    }
  }

  /**
   * Specify whether the input should be focussed when component loaded.
   */
  @Prop() focusOnLoad?: boolean = false;

  /**
   * Provide hint text for hidden assistive description element.
   */
  @Prop() hintText?: string =
    "When autocomplete results are available use the up and down arrows to choose and press enter to select";

  /**
   * Provide text for empty results list
   */
  @Prop() emptyOptionListText = "No results found";

  /**
   * Number of characters until suggestions appear
   */
  @Prop() charactersUntilSuggestion: number = 2;

  @Watch("value")
  watchValueHandler(newValue: string): void {
    if (
      this.inputEl &&
      this.options &&
      !!getLabelFromValue(newValue, this.options)
    ) {
      this.inputEl.value = getLabelFromValue(newValue, this.options);
    } else if (this.inputEl && this.inputEl.value !== newValue) {
      this.inputEl.value = newValue;
    }

    this.icChange.emit({ value: newValue });
  }

  /**
   * Sets focus on the native `input`
   */
  @Method()
  async setFocus(): Promise<void> {
    if (this.inputEl) {
      this.inputEl.setFocus();
    }
  }

  @Listen("icKeydown", {})
  handleKeyDown(ev: CustomEvent): void {
    const keyEv: KeyboardEvent = ev.detail.event;
    if (this.menu && this.open) {
      this.menu.handleKeyboardOpen(keyEv);
    }
  }

  @Listen("keyup", {})
  handleKeyUp(ev: KeyboardEvent): void {
    if (ev.key === "Enter") {
      if (this.preventSubmit) {
        return;
      }

      this.handleSubmitSearch();
      this.setMenuChange(false);
    }

    if (ev.key === "Escape") {
      this.setMenuChange(false);
    }

    if (this.preventSubmit) {
      this.preventSubmit = false;
    }
  }

  private handleSubmitSearch = () => {
    this.icSubmitSearch.emit({ value: this.value });

    const form: HTMLFormElement = this.el.closest("FORM");

    if (this.searchSubmitButton && !!form && !this.preventSubmit) {
      handleHiddenFormButtonClick(form, this.searchSubmitButton);
    }
  };

  /**
   * Emitted when a keyboard input occurred.
   */
  @Event() icInput: EventEmitter<IcValueEventDetail>;
  private onInput = (ev: Event) => {
    this.value = (ev.target as HTMLInputElement).value;

    if (this.options.length > 0) {
      this.setMenuChange(true);

      if (this.disableFilter === false) {
        const rawFilteredOptions = getFilteredMenuOptions(
          this.options,
          false,
          this.value,
          "anywhere"
        );

        const noOptions = [{ label: this.emptyOptionListText, value: "" }];

        this.filteredOptions =
          rawFilteredOptions.length > 0 ? rawFilteredOptions : noOptions;
      }
    }

    if (!this.showClearButton) {
      this.handleShowClearButton(true);
    }

    this.debounceAriaLiveUpdate();

    this.icInput.emit({ value: this.value });
  };

  private debounceAriaLiveUpdate() {
    clearTimeout(this.debounce);

    this.debounce = window.setTimeout(() => {
      this.updateSearchResultAriaLive();
    }, 500);
  }

  /**
   * Emitted when input loses focus.
   */
  @Event() icInputBlur: EventEmitter<IcSearchBarBlurEventDetail>;
  private onInputBlur = (ev: Event) => {
    const value = (ev.target as HTMLInputElement).value;
    const nextFocus = (ev as FocusEvent).relatedTarget;

    this.icInputBlur.emit({ value: value, relatedTarget: nextFocus });
  };

  /**
   * Emitted when input gains focus.
   */
  @Event() icInputFocus: EventEmitter<IcValueEventDetail>;
  private onInputFocus = (ev: Event) => {
    const value = (ev.target as HTMLInputElement).value;
    this.icInputFocus.emit({ value: value });

    this.handleShowClearButton(true);
  };

  /**
   * Emitted when the value has changed.
   */
  @Event() icChange: EventEmitter<IcValueEventDetail>;

  /**
   * Emitted when value is cleared with clear button
   */
  @Event() icClear: EventEmitter<void>;
  private handleClear = (ev: Event) => {
    const keyboardEvent = ev as KeyboardEvent;
    const mouseEvent = ev as MouseEvent;

    if (
      mouseEvent.type === "click" ||
      keyboardEvent.code === "Enter" ||
      keyboardEvent.code === "Space"
    ) {
      this.value = "";
      this.inputEl.value = "";
      this.el.setFocus();

      this.icClear.emit();
      ev.preventDefault();

      this.preventSubmit = true;
    }
  };

  /**
   * Emitted when the search value has been submitted
   */
  @Event() icSubmitSearch: EventEmitter<IcValueEventDetail>;

  /**
   * Emitted when option is highlighted within the menu
   */
  @Event() icOptionSelect: EventEmitter<IcOptionSelectEventDetail>;

  /**
   * Emitted when the state of the menu changes (i.e. open or close)
   */
  @Event() icMenuChange: EventEmitter<IcMenuChangeEventDetail>;
  /**
   * @internal - Emitted when blur is invoked from clear button
   */
  @Event() icClearBlur: EventEmitter<IcBlurEventDetail>;
  private handleClearBlur = (ev: Event) => {
    const nextFocus = (ev as FocusEvent).relatedTarget;

    this.icClearBlur.emit({ relatedTarget: nextFocus });

    this.clearButtonFocused = false;
  };

  /**
   * @internal - Emitted when blur is invoked from search submit button
   */
  @Event() icSubmitSearchBlur: EventEmitter<IcBlurEventDetail>;
  private handleSubmitSearchBlur = (ev: Event) => {
    const nextFocus = (ev as FocusEvent).relatedTarget;

    this.icSubmitSearchBlur.emit({ relatedTarget: nextFocus });

    this.searchSubmitFocused = false;
  };

  private handleSubmitSearchFocus = () => {
    this.handleMenuCloseFromMenuChange(true);
    this.searchSubmitFocused = true;
  };

  /**
   * Emitted when blur is invoked from ic-search-bar
   */
  @Event() icSearchBarBlur: EventEmitter<IcSearchBarBlurEventDetail>;

  /**
   * Emitted when focus is invoked from ic-search-bar
   */
  @Event() icSearchBarFocus: EventEmitter<void>;

  @State() open: boolean = false;
  @State() filteredOptions: IcMenuOption[] = [];
  @State() ariaActiveDescendant: string;
  @State() showClearButton: boolean = false;
  @State() clearButtonFocused: boolean = false;
  @State() searchSubmitFocused: boolean = false;
  @State() prevNoOption: boolean = false;

  private handleOptionSelect = (ev: CustomEvent) => {
    if (ev.detail.label === this.emptyOptionListText) {
      this.el.setFocus();
      return;
    }

    this.value = ev.detail.value;
    this.icOptionSelect.emit({ value: this.value });
  };

  private handleMenuChange = (ev: CustomEvent) => {
    this.setMenuChange(ev.detail.open);
  };

  private setMenuChange = (open: boolean) => {
    if (this.open !== open) {
      this.open = open;
      this.icMenuChange.emit({ open });
    }
  };

  private handleHostFocus = () => {
    if (this.options && this.value && !this.menuCloseFromMenuChangeEvent) {
      this.setMenuChange(true);
    }
    this.handleTruncateValue(false);

    this.icSearchBarFocus.emit();
  };

  private handleHostBlur = (ev: Event) => {
    const nextFocus = (ev as FocusEvent).relatedTarget;
    if (this.open && this.options && nextFocus !== this.menu) {
      this.setMenuChange(false);
    }

    this.handleShowClearButton(false);
    this.handleMenuCloseFromMenuChange(false);
    this.handleTruncateValue(true);
    this.icSearchBarBlur.emit({ relatedTarget: nextFocus, value: this.value });
  };

  @Listen("menuChange", {})
  onMenuClose(ev: CustomEvent): void {
    if (!ev.detail.open) {
      this.handleMenuCloseFromMenuChange(true);
      if (ev.detail.focusInput === undefined || ev.detail.focusInput) {
        this.el.setFocus();
      }
    }
  }

  @Listen("menuOptionId")
  onMenuOptionHighlighted(ev: CustomEvent): void {
    if (ev.detail.optionId) {
      this.ariaActiveDescendant = ev.detail.optionId;
    } else {
      this.ariaActiveDescendant = undefined;
    }
  }

  private handleShowClearButton = (visible: boolean): void => {
    this.showClearButton = visible;
  };

  private handleFocusClearButton = (): void => {
    this.clearButtonFocused = true;
  };

  private handleMenuCloseFromMenuChange = (fromEvent: boolean): void => {
    this.menuCloseFromMenuChangeEvent = fromEvent;
  };

  private handleTruncateValue = (truncate: boolean): void => {
    this.truncateValue = truncate;
  };

  private renderAssistiveHintEl = (): void => {
    const input = this.el.shadowRoot
      .querySelector("ic-text-field")
      ?.shadowRoot?.querySelector(`#${this.inputId}`);

    if (
      input &&
      Object.keys(input).length > 0 &&
      this.hasOptionsOrFilterDisabled()
    ) {
      this.assistiveHintEl = document.createElement("span");
      this.assistiveHintEl.innerText = this.hintText;
      this.assistiveHintEl.id = `${this.inputId}-assistive-hint`;
      this.assistiveHintEl.style.display = "none";
      if (input.after !== undefined) {
        input.after(this.assistiveHintEl);
      }
    }
  };

  private updateSearchResultAriaLive = (): void => {
    const searchResultsStatusEl = this.el.shadowRoot.querySelector(
      ".search-results-status"
    ) as HTMLParagraphElement;

    if (!this.open || this.value === "") {
      searchResultsStatusEl.innerText = "";
    } else if (
      this.options.length > 0 &&
      this.filteredOptions.length > 0 &&
      this.open &&
      searchResultsStatusEl
    ) {
      searchResultsStatusEl.innerText = `${this.filteredOptions.length} result${
        this.filteredOptions.length > 1 ? "s" : ""
      } available`;
    }
  };

  private hasOptionsOrFilterDisabled = (): boolean =>
    this.options.length > 0 || this.disableFilter;

  private highlightFirstOptionAfterNoResults = () => {
    if (this.prevNoOption && this.menu) {
      this.menu.handleSetFirstOption();
      this.prevNoOption = false;
    }
    const prevNoOptionsList = this.filteredOptions.find(
      (filteredOption) => filteredOption.label === this.emptyOptionListText
    );
    if (prevNoOptionsList) {
      this.prevNoOption = true;
    }
  };

  connectedCallback(): void {
    this.debounceChanged();
  }

  componentWillRender(): void {
    this.highlightFirstOptionAfterNoResults();
  }

  componentWillLoad(): void {
    this.watchValueHandler(this.value);
  }

  componentDidLoad(): void {
    if (this.focusOnLoad) {
      this.el.setFocus();
    }

    if (this.hasOptionsOrFilterDisabled()) {
      this.renderAssistiveHintEl();
      if (this.disableFilter) {
        this.filteredOptions = this.options;
      }
    }

    onComponentRequiredPropUndefined(
      [{ prop: this.label, propName: "label" }],
      "Search Bar"
    );

    this.anchorEl = this.inputEl.shadowRoot.querySelector(
      "ic-input-component-container"
    );
  }

  disconnectedCallback(): void {
    if (this.assistiveHintEl) {
      this.assistiveHintEl.remove();
    }
  }

  render() {
    const {
      inputId,
      name,
      label,
      required,
      small,
      placeholder,
      helperText,
      disabled,
      value,
      readonly,
      spellcheck,
      fullWidth,
      options,
      open,
      hideLabel,
      menuId,
      ariaActiveDescendant,
      truncateValue,
      autofocus,
      autocapitalize,
      autocomplete,
      filteredOptions,
    } = this;

    const disabledMode = readonly || disabled ? true : false;

    const describedBy = getInputDescribedByText(
      inputId,
      helperText !== "",
      false
    ).trim();

    let describedById;

    if (describedBy !== "" && this.hasOptionsOrFilterDisabled()) {
      describedById = `${describedBy} ${this.inputId}-assistive-hint`;
    } else if (this.hasOptionsOrFilterDisabled()) {
      describedById = `${this.inputId}-assistive-hint`;
    } else if (describedBy !== "") {
      describedById = describedBy;
    } else {
      describedById = undefined;
    }

    const disabledText = disabledMode && !readonly;
    const hasSuggestedSearch = value && options.length > 0;
    const valueNotSet = value === undefined || value === null || value === "";
    const menuOpen = hasSuggestedSearch && open && filteredOptions.length > 0;

    const hadNoOptions =
      filteredOptions.length > 0 &&
      filteredOptions[0].label === this.emptyOptionListText;

    let expanded;

    if (options.length > 0) {
      if (menuOpen) {
        expanded = "true";
      } else {
        expanded = "false";
      }
    } else {
      expanded = undefined;
    }

    renderHiddenInput(true, this.el, name, value, disabledMode);

    return (
      <Host
        class={{
          ["search"]: true,
          ["fullwidth"]: fullWidth,
          ["disabled"]: disabled,
          ["small"]: small,
        }}
        onFocus={this.handleHostFocus}
        onBlur={this.handleHostBlur}
      >
        <ic-text-field
          ref={(el) => (this.inputEl = el)}
          inputId={inputId}
          label={label}
          helperText={helperText}
          required={required}
          disabled={disabledText}
          readonly={readonly}
          small={small}
          hideLabel={hideLabel}
          fullWidth={fullWidth}
          name={name}
          truncateValue={truncateValue}
          value={
            options && !!getLabelFromValue(value, options)
              ? getLabelFromValue(value, options)
              : value
          }
          placeholder={placeholder}
          onInput={this.onInput}
          onBlur={this.onInputBlur}
          onFocus={this.onInputFocus}
          aria-label={hideLabel ? label : ""}
          aria-describedby={describedById}
          aria-owns={hasSuggestedSearch ? menuId : undefined}
          aria-haspopup={options.length > 0 ? "listbox" : undefined}
          ariaExpanded={expanded}
          ariaActiveDescendant={ariaActiveDescendant}
          aria-autocomplete={hasSuggestedSearch ? "list" : undefined}
          role={hasSuggestedSearch ? "combobox" : undefined}
          autocomplete={autocomplete}
          autocapitalize={autocapitalize}
          autoFocus={autofocus}
          spellcheck={spellcheck}
          inputmode="search"
        >
          <div
            class={{
              "clear-button-container": true,
              "clear-button-visible":
                value && !disabledMode && this.showClearButton,
            }}
            slot="clear-button"
          >
            <ic-button
              id="clear-button"
              class="clear-button"
              aria-label="Clear"
              innerHTML={clearIcon}
              onClick={this.handleClear}
              size={small ? "small" : "default"}
              onFocus={this.handleFocusClearButton}
              onBlur={this.handleClearBlur}
              onKeyDown={this.handleClear}
              type="submit"
              variant="icon"
              appearance={
                this.clearButtonFocused
                  ? IcThemeForegroundEnum.Light
                  : IcThemeForegroundEnum.Dark
              }
            ></ic-button>
            <div class="divider"></div>
          </div>
          <div
            class={{
              "search-submit-button-container": true,
              "search-submit-button-disabled":
                valueNotSet || disabled || hadNoOptions,
            }}
            slot="search-submit-button"
          >
            <ic-button
              id="search-submit-button"
              aria-label="Search"
              ref={(el) => (this.searchSubmitButton = el)}
              class={{
                ["search-submit-button"]: true,
                ["search-submit-button-small"]: !!small,
              }}
              disabled={valueNotSet || disabled || hadNoOptions}
              innerHTML={searchIcon}
              size={small ? "small" : "default"}
              onClick={this.handleSubmitSearch}
              onBlur={this.handleSubmitSearchBlur}
              onFocus={this.handleSubmitSearchFocus}
              type="submit"
              variant="icon"
              appearance={
                this.searchSubmitFocused
                  ? IcThemeForegroundEnum.Light
                  : IcThemeForegroundEnum.Default
              }
            ></ic-button>
          </div>
          <div
            class={{
              "menu-container": true,
              fullwidth: fullWidth,
            }}
            slot="menu"
          >
            {menuOpen && value.length >= this.charactersUntilSuggestion && (
              <ic-menu
                class={{
                  "no-results": hadNoOptions,
                }}
                activationType="manual"
                anchorEl={this.anchorEl}
                autoFocusOnSelected={false}
                inputEl={this.inputEl}
                inputLabel={label}
                ref={(el) => (this.menu = el)}
                small={small}
                fullWidth={fullWidth}
                menuId={menuId}
                open={true}
                options={filteredOptions}
                onOptionSelect={this.handleOptionSelect}
                onMenuChange={this.handleMenuChange}
                parentEl={this.el}
                value={value}
              ></ic-menu>
            )}
          </div>
        </ic-text-field>
        <div
          aria-live="polite"
          role="status"
          class="search-results-status"
        ></div>
      </Host>
    );
  }
}

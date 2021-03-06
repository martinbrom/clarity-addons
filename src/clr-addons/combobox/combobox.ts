/*
 * Copyright (c) 2018-2020 Porsche Informatik. All Rights Reserved.
 * This software is released under MIT license.
 * The full license information can be found in LICENSE in the root directory of this project.
 */

import { isPlatformBrowser } from '@angular/common';
import {
  AfterContentInit,
  ChangeDetectorRef,
  Component,
  ContentChild,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Injector,
  Input,
  OnDestroy,
  OnInit,
  Output,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import {
  ClrLabel,
  ClrPopoverToggleService,
  ɵb as RootDropdownService,
  ɵba as LayoutService,
  ɵbb as NgControlService,
  ɵbd as IfErrorService,
  ɵbc as ControlClassService,
  ɵe as POPOVER_HOST_ANCHOR,
  ɵz as ControlIdService,
  ɵj as DROPDOWN_FOCUS_HANDLER_PROVIDER,
  ɵh as FOCUS_SERVICE_PROVIDER,
  ɵd as ROOT_DROPDOWN_PROVIDER,
} from '@clr/angular';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { ClrOption } from './option';
import { ClrOptions } from './options';
import { OptionSelectionService } from './providers/option-selection.service';
import { ComboboxDomAdapter } from './utils/combobox-dom-adapter.service';
import { ComboboxNoopDomAdapter } from './utils/combobox-noop-dom-adapter.service';
import { DOWN_ARROW, ENTER, TAB, UP_ARROW } from './utils/constants';
import { MobileBehaviourMode } from './utils/mobile-behaviour-mode';

// Fixes build error
// @dynamic (https://github.com/angular/angular/issues/19698#issuecomment-338340211)
export function comboboxDomAdapterFactory(platformId: Record<string, any>): ComboboxDomAdapter {
  if (isPlatformBrowser(platformId)) {
    return new ComboboxDomAdapter();
  } else {
    return new ComboboxNoopDomAdapter();
  }
}

/**
 * @deprecated in v7.0
 * This component is deprecated, do not use it anymore.
 * Instead use Clarity's Data List Component: {@link https://clarity.design/documentation/datalist}.
 * Will be removed with version 8!
 */
@Component({
  selector: 'clr-combobox',
  templateUrl: './combobox.html',
  providers: [
    ClrPopoverToggleService,
    { provide: POPOVER_HOST_ANCHOR, useExisting: ElementRef },
    OptionSelectionService,
    { provide: ComboboxDomAdapter, useFactory: comboboxDomAdapterFactory, deps: [PLATFORM_ID] },
    ControlClassService,
    LayoutService,
    ControlIdService,
    NgControlService,
    IfErrorService,
    DROPDOWN_FOCUS_HANDLER_PROVIDER,
    FOCUS_SERVICE_PROVIDER,
    ROOT_DROPDOWN_PROVIDER,
  ],
  host: {
    '[class.clr-combobox]': 'true',
  },
})
export class ClrCombobox<T> implements OnInit, AfterContentInit, OnDestroy {
  @Input('clrControlClasses') controlClasses: string;
  @Input('clrAllowUserEntry') allowUserEntry = false;
  @Input('clrPreselectedValue') preselectedValue: T;
  @Input('clrMobileBehaviourMode') mobileBehaviourMode: MobileBehaviourMode = MobileBehaviourMode.DEFAULT;
  @Input('clrDisabled') disabled = false;
  @Output('clrSelectedOption') selectedOption: EventEmitter<ClrOption<T>> = new EventEmitter<ClrOption<T>>();
  @Output('clrEnteredValue') enteredValue: EventEmitter<string> = new EventEmitter<string>();
  @Output('blur') onBlur = new EventEmitter();

  @HostBinding('class.clr-empty') noSearchResults: boolean;

  @ViewChild('input', { static: true }) input: ElementRef;
  @ContentChild(ClrOptions, { static: true }) options: ClrOptions<T>;
  @ContentChild(ClrLabel, { static: true }) label: ClrLabel;
  invalid = false;
  keyHandled = false;
  private subscriptions: Subscription[] = [];
  selectedValue: T = this.preselectedValue;

  private layoutService: LayoutService;
  private controlClassService: ControlClassService;
  private dropdownService: RootDropdownService;

  constructor(
    private cd: ChangeDetectorRef,
    public popoverToggleService: ClrPopoverToggleService,
    private optionSelectionService: OptionSelectionService<T>,
    private domAdapter: ComboboxDomAdapter,
    injector: Injector
  ) {
    console.warn('The ClrCombobox is deprecated as of clr-addons version 7. Use the ClrDataList instead!');
    // We have to inject obfuscated imports this way,
    // otherwise ivy compilation does not work for applications using clarity-addons!
    this.layoutService = injector.get(LayoutService);
    this.controlClassService = injector.get(ControlClassService);
    this.dropdownService = injector.get(RootDropdownService);
    this.subscriptions.push(this.dropdownService.changes.subscribe(value => (this.popoverToggleService.open = value)));
    this.subscriptions.push(popoverToggleService.openChange.subscribe(() => this.cd.markForCheck()));
  }

  private initializeSubscriptions(): void {
    this.subscriptions.push(
      this.optionSelectionService.selectionChanged.subscribe((option: ClrOption<T>) => {
        this.renderSelection(option);
      })
    );
    this.subscriptions.push(
      this.optionSelectionService.searchValueChanged.subscribe((value: string) => {
        if (this.allowUserEntry) {
          this.enteredValue.emit(value);
        }
        if (value !== null) {
          this.popoverToggleService.open = true;
        }
      })
    );
    this.subscriptions.push(
      this.optionSelectionService.navigatableOptionsChanged.subscribe((count: number) => {
        this.noSearchResults = count === 0;
      })
    );
  }

  private renderSelection(selectedOption: ClrOption<T>): void {
    this.selectedOption.emit(selectedOption);
    if (this.input && selectedOption) {
      this.selectedValue = selectedOption.value;
      this.input.nativeElement.innerText = selectedOption.getDisplayedText();
      this.validateInput();
    }
  }

  showOptions(): boolean {
    return this.popoverToggleService.open;
  }

  toggleOptionsMenu(event: MouseEvent): void {
    this.popoverToggleService.toggleWithEvent(event);
  }

  @HostListener('click')
  focusInput(): void {
    if (this.input) {
      this.domAdapter.focus(this.input.nativeElement);
    }
  }

  keydown(event: KeyboardEvent): void {
    if (event && !this.disabled) {
      this.keyHandled = this.navigateOptions(event);
      this.keyHandled = this.keyHandled || this.closeMenuOnTabPress(event);
    }
  }

  navigateOptions(event: KeyboardEvent): boolean {
    if (event.keyCode === DOWN_ARROW) {
      this.popoverToggleService.open = true;
      this.optionSelectionService.navigateToNextOption();
      return true;
    } else if (event.keyCode === UP_ARROW) {
      this.popoverToggleService.open = true;
      this.optionSelectionService.navigateToPreviousOption();
      return true;
    } else if (event.keyCode === ENTER) {
      this.optionSelectionService.selectActiveOption();
      event.preventDefault();
      return true;
    }
    return false;
  }

  closeMenuOnTabPress(event: KeyboardEvent): boolean {
    if (event.keyCode === TAB) {
      this.popoverToggleService.open = false;
      return true;
    }
    return false;
  }

  search(): void {
    if (!this.keyHandled && !this.disabled) {
      this.optionSelectionService.setSearchValue(this.input.nativeElement.textContent.trim());
    }
    this.keyHandled = false;
  }

  blur(): void {
    this.onBlur.emit();
    if (!this.allowUserEntry) {
      if (!this.popoverToggleService.open) {
        this.validateInput();
      } else {
        // Wait for validation until dropdown is closed, as a click on a dropdown menu loses focus too early
        this.popoverToggleService.openChange.pipe(take(1)).subscribe(() => {
          this.validateInput();
        });
      }
    }
  }

  validateInput(): void {
    let selectedOption: ClrOption<T>;
    let searchValue: string;

    this.optionSelectionService.selectionChanged
      .subscribe((selected: ClrOption<T>) => {
        selectedOption = selected;
      })
      .unsubscribe();

    this.optionSelectionService.searchValueChanged
      .subscribe((value: string) => {
        searchValue = value;
      })
      .unsubscribe();
    if (!selectedOption && searchValue && searchValue.length > 0) {
      this.invalid = true;
    } else {
      this.invalid = false;
    }
  }

  addGrid(): boolean {
    if (this.layoutService && !this.layoutService.isVertical()) {
      return true;
    }
    return false;
  }

  controlClass(): string {
    return this.controlClasses
      ? this.controlClasses
      : this.controlClassService.controlClass(this.invalid, this.addGrid());
  }

  // Lifecycle methods
  ngOnInit(): void {
    this.initializeSubscriptions();
  }

  ngAfterContentInit(): void {
    this.optionSelectionService.setOptions(this.options);
    this.optionsUpdatedByUser();
    this.subscriptions.push(
      this.options.options.changes.subscribe(() => {
        this.optionsUpdatedByUser();
      })
    );
  }

  optionsUpdatedByUser(): void {
    if (this.options.options.length > 0 && !!this.preselectedValue) {
      const option = this.options.options.find(o => o.value === this.preselectedValue);
      if (option) {
        this.optionSelectionService.setSelection(option);
      }
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  showSelect(): boolean {
    switch (this.mobileBehaviourMode) {
      case MobileBehaviourMode.FORCE_SELECT:
        return true;
      case MobileBehaviourMode.FORCE_AUTOCOMPLETE:
        return false;
      default:
        return !this.allowUserEntry;
    }
  }

  getOptionsAsArray(): Array<ClrOption<T>> {
    if (this.options.options) {
      return this.options.options.toArray();
    }
    return [];
  }

  selectedValueChange(): void {
    const option = this.options.options.find(o => o.value === this.selectedValue);
    this.optionSelectionService.setSelection(option);
  }
}

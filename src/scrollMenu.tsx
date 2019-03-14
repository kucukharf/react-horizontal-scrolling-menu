import React, { WheelEvent } from 'react';

import {
  translateIsValid,
  notUndefOrNull,
  getClientRect,
  testPassiveEventSupport,
} from './utils';
import {
  defaultProps,
  defaultMenuStyle,
  defaultWrapperStyle,
} from './defautSettings';
import { MenuProps, Ref, RefObject, Void, MenuItem, MenuItems } from './types';
import { ArrowWrapper, InnerWrapper } from './wrapper';

interface MenuState {
  dragging: boolean;
  xPoint: number;
  translate: number;
  startDragTranslate: number;
  xDraggedDistance: number;
  leftArrowVisible: boolean;
  rightArrowVisible: boolean;
}

export class ScrollMenu extends React.Component<MenuProps, MenuState> {
  static defaultProps: MenuProps = defaultProps;

  private ref: RefObject;
  private menuWrapper: Ref;
  private menuInner: Ref;
  private mounted: boolean;
  private needUpdate: boolean;
  private allItemsWidth: number;
  private menuPos: number;
  private menuWidth: number;
  private wWidth: number;
  private firstPageOffset: number;
  private lastPageOffset: number;
  private lastTranslateUpdate: number;
  private menuItems: MenuItems;
  private selected: string;

  /** timers for setTimeout if RAF not supported */
  private onLoadTimer: any;
  private rafTimer: any;
  private resizeTimer: any;

  constructor(props: MenuProps) {
    super(props);
    this.ref = {};
    this.menuWrapper = null;
    this.menuInner = null;
    this.mounted = false;
    this.needUpdate = false;
    this.allItemsWidth = 0;
    this.menuPos = 0;
    this.menuWidth = 0;
    this.wWidth = 0;
    this.firstPageOffset = 0;
    this.lastPageOffset = 0;
    this.lastTranslateUpdate = 0;
    this.menuItems = [];
    this.selected = '';

    this.onLoadTimer = 0;
    this.rafTimer = 0;
    this.resizeTimer = 0;

    checkVersion(this);
  }

  state = {
    dragging: false,
    xPoint: 0,
    translate: this.props.translate,
    startDragTranslate: 0,
    xDraggedDistance: 0,
    leftArrowVisible: false,
    rightArrowVisible: true,
  };

  componentDidMount(): Void {
    this.setInitial();

    window.requestAnimationFrame =
      window.requestAnimationFrame || function() {};

    const passiveEvents = testPassiveEventSupport();
    const optionsCapture = passiveEvents
      ? { passive: true, capture: true }
      : true;
    const optionsNoCapture = passiveEvents
      ? { passive: true, capture: false }
      : false;


    window.addEventListener('load', this.onLoad, optionsNoCapture);
    window.addEventListener('resize', this.resizeHandler, optionsNoCapture);
    document.addEventListener('mousemove', this.handleDrag, optionsCapture);
    document.addEventListener('mouseup', this.handleDragStop, optionsCapture);

    // if styles loaded before js bundle need wait for it
    this.onLoadTimer = setTimeout(() => (this.onLoad(), this.forceUpdate()), 0);
  }

  shouldComponentUpdate(nextProps: MenuProps, nextState: MenuState): boolean {
    // TODO: need refactor all this or remove
    // it's too complicated already
    const {
      translate,
      dragging,
      leftArrowVisible,
      rightArrowVisible,
    } = this.state;
    const {
      translate: translateNew,
      dragging: draggingNew,
      leftArrowVisible: leftArrowVisibleNew,
      rightArrowVisible: rightArrowVisibleNew,
    } = nextState;

    const {
      translate: translateProps,
      selected: selectedProps,
      scrollToSelected,
    } = this.props;
    const {
      translate: translatePropsNew,
      selected: selectedPropsNew,
    } = nextProps;

    const translatePropsNotNull = notUndefOrNull(translatePropsNew);
    const translateStateDiff = translate !== translateNew;
    const translatePropsDiff =
      translatePropsNotNull && translateProps !== translatePropsNew;
    const translateDiff =
      translatePropsNew !== translateNew ||
      (translateStateDiff || translatePropsDiff);

    const selectedPropsDiff =
      notUndefOrNull(selectedPropsNew) && selectedProps !== selectedPropsNew;
    const selectedDiff = selectedPropsDiff;

    const propsDiff = translateDiff || selectedDiff;

    const leftArrowVisibleDiff = leftArrowVisible !== leftArrowVisibleNew;
    const rightArrowVisibleDiff = rightArrowVisible !== rightArrowVisibleNew;

    let translateResult = translateNew;

    const newMenuItems =
      this.props.data !== nextProps.data ||
      this.props.data.length !== nextProps.data.length;
    const newTranslateProps =
      translateIsValid(translatePropsNew) &&
      translatePropsDiff &&
      !newMenuItems;

    if (newMenuItems || (scrollToSelected && selectedPropsDiff)) {
      this.needUpdate = true;
    }

    if (propsDiff) {
      if (selectedPropsDiff) {
        this.selected = selectedPropsNew;
      }

      if (newTranslateProps) {
        translateResult = translatePropsNew;
      }
    }

    if (newTranslateProps) {
      this.setState({ translate: +translateResult });
    }

    return (
      newMenuItems ||
      translateDiff ||
      dragging !== draggingNew ||
      propsDiff ||
      leftArrowVisibleDiff ||
      rightArrowVisibleDiff
    );
  }

  componentDidUpdate(prevProps: MenuProps, prevState: MenuState): Void {
    // update if have new menu items or selected value
    if (this.needUpdate) {
      this.needUpdate = false;
      this.onLoad();
    }

    const { translate: translateOld } = prevState;
    let { translate: translateNew, dragging } = this.state;

    if (!dragging && translateOld !== translateNew) {
      this.onUpdate({ translate: translateNew, translateOld });
    }

    const { hideSingleArrow, transition } = this.props;
    if (hideSingleArrow) {
      requestAnimationFrame(this.setSingleArrowVisibility);
      this.rafTimer = setTimeout(
        () => requestAnimationFrame(this.setSingleArrowVisibility),
        transition * 1000 + 10
      );
    }
  }

  componentWillUnmount(): Void {
    window.removeEventListener('resize', this.resizeHandler);
    document.removeEventListener('mousemove', this.handleDrag);
    document.removeEventListener('mouseup', this.handleDragStop);
    clearTimeout(this.rafTimer);
    clearTimeout(this.onLoadTimer);
    clearTimeout(this.resizeTimer);
  }

  /** set ref for MenuItems */
  setRef = (ref: RefObject): Void => {
    const [key, value] = Object.entries(ref)[0];
    value.elem ? (this.ref[key] = value) : false;
  };

  setMenuInnerRef = (ref: Ref) => {
    this.menuInner = ref;
  };

  /** set ref for wrapper */
  setWrapperRef = (ref: Ref): Void => {
    this.menuWrapper = ref;
  };

  /** check if arrows visible */
  checkSingleArrowVisibility = ({
    translate = this.state.translate,
  }: {
    translate?: number;
  }): { leftArrowVisible: boolean; rightArrowVisible: boolean } => {
    const { hideSingleArrow } = this.props;
    let [leftArrowVisible, rightArrowVisible] = [true, true];
    const { menuItems: items } = this;

    if (hideSingleArrow && items) {
      const visibleItems = this.getVisibleItems({ offset: translate });
      const firstItemVisible = visibleItems.includes(items[0]);
      const lastItemVisible = visibleItems.includes(items.slice(-1)[0]);
      leftArrowVisible = !firstItemVisible;
      rightArrowVisible = !lastItemVisible;
    }

    return { leftArrowVisible, rightArrowVisible };
  };

  /** check arrows visible or not and setState */
  setSingleArrowVisibility = (): Void => {
    const { leftArrowVisible, rightArrowVisible } = this.state;
    const {
      leftArrowVisible: leftArrowVisibleNew,
      rightArrowVisible: rightArrowVisibleNew,
    } = this.checkSingleArrowVisibility({});
    if (
      leftArrowVisible !== leftArrowVisibleNew ||
      rightArrowVisible !== rightArrowVisibleNew
    ) {
      this.setState({
        leftArrowVisible: leftArrowVisibleNew,
        rightArrowVisible: rightArrowVisibleNew,
      });
    }
  };

  onLoad = (): Void => {
    this.setInitial();
    this.mounted = true;
  };

  /** kinda debounce */
  resizeHandler = (): Void => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.resize(), 200);
  };

  /** Set values on resize */
  resize = (): Void => {
    this.updateWidth({});
  };

  /** set initial values and for updates */
  setInitial = (): Void => {
    const {
      selected,
      data,
      translate: translateProps,
      scrollToSelected,
    } = this.props;
    const { translate: translateState } = this.state;
    if (!data || !data.length) return false;
    let translateProp = translateProps;

    const menuItems = this.getMenuItems();
    const selectedItem = data.find(el => el.key === selected);
    this.menuItems = menuItems;
    this.selected = selectedItem
      ? String(selectedItem.key || '')
      : defaultProps.selected;

    // align item on initial load
    this.updateWidth({});

    const newState = { ...this.state };

    // set translate on first load
    const firstMountAndDefaultTranslate =
      !this.mounted && translateProp === defaultProps.translate;
    if (
      firstMountAndDefaultTranslate ||
      (!translateIsValid(translateProp) && !translateIsValid(translateState))
    ) {
      newState.translate = this.firstPageOffset;
    }

    // check arrows
    const {
      leftArrowVisible,
      rightArrowVisible,
    } = this.checkSingleArrowVisibility({ translate: translateProp });
    newState.leftArrowVisible = leftArrowVisible;
    newState.rightArrowVisible = rightArrowVisible;

    // scrollToSelected
    if (scrollToSelected) {
      const needScroll = this.isScrollNeeded({
        itemId: selected,
        translate: newState.translate,
      });
      if (needScroll) {
        newState.translate = this.getOffsetToItemByKey(selected);
      }
    }

    this.setState({ ...newState });
  };

  /** check if selected item visible on screen or need scroll to it */
  isScrollNeeded = ({
    itemId,
    translate = this.state.translate,
  }: {
    itemId: string;
    translate?: number;
  }): boolean => {
    const { menuItems } = this;
    const item = this.getItemByKey(itemId);

    const visibleItems = this.getVisibleItems({
      offset: translate,
    });
    return !visibleItems.includes(item);
  };

  /** external api, scroll to item by it key */
  scrollTo = (itemKey: string): Void => {
    const { translate } = this.state;
    const newTranslate = this.getOffsetToItemByKey(itemKey);
    this.selected = itemKey;
    if (translate === newTranslate) return false;

    this.setState({ translate: newTranslate });
  };

  /** get MenuItems from refs */
  getMenuItems = (): MenuItems =>
    Object.entries(this.ref).slice(0, this.props.data.length || 0);

  /** get width of all menu items */
  getItemsWidth = ({
    items = this.menuItems,
  }: {
    items?: MenuItems;
  }): number => {
    return items
      .map(el => el[1].elem)
      .filter(Boolean)
      .reduce((acc, el) => (acc += getClientRect(el).width), 0);
  };

  /** get width of items, window and pos of menu */
  getWidth = ({
    items,
  }: {
    items: MenuItems;
  }): {
    wWidth: number;
    menuPos: number;
    menuWidth: number;
    allItemsWidth: number;
  } => {
    const wWidth = window && window.innerWidth;
    const { x: menuPos, width: menuWidth } = getClientRect(this.menuWrapper);
    const allItemsWidth = this.getItemsWidth({ items });
    return { wWidth, menuPos, menuWidth, allItemsWidth };
  };

  /** values from 2 functions above */
  updateWidth = ({
    items = this.menuItems,
  }: {
    items?: MenuItems;
  }): Void => {
    const { wWidth, menuPos, menuWidth, allItemsWidth } = this.getWidth({ items });
    const { firstPageOffset, lastPageOffset } = this.getPagesOffsets({ items, wWidth, menuPos, menuWidth, allItemsWidth });
    this.menuPos = menuPos;
    this.wWidth = wWidth;
    this.allItemsWidth = allItemsWidth;
    this.menuWidth = menuWidth;
    this.firstPageOffset = firstPageOffset;
    this.lastPageOffset = lastPageOffset;
  };

  /** get firstPageOffset */
  getFirstPageOffset = ({
    items = this.menuItems,
    offset = this.state.translate,
    wWidth = this.wWidth,
    menuPos = this.menuPos,
    menuWidth = this.menuWidth,
  }: {
    items: MenuItems;
    offset: number;
    wWidth: number;
    menuPos: number;
    menuWidth: number;
  }): number => {
    const visibleItemsStart = this.getVisibleItems({
      offset,
      items,
      wWidth,
      menuPos,
      menuWidth,
    });
    const firstPageOffset = this.getCenterOffset({
      items: visibleItemsStart,
      menuWidth,
    });
    return firstPageOffset;
  };

  /** get lastPageOffset */
  getLastPageOffset = ({
    items = this.menuItems,
    allItemsWidth = this.allItemsWidth,
    wWidth = this.wWidth,
    menuPos = this.menuPos,
    menuWidth = this.menuWidth,
  }: {
    items: MenuItems;
    allItemsWidth: number;
    wWidth: number;
    menuPos: number;
    menuWidth: number;
  }): number => {
    const visibleItemsEnd = this.getVisibleItems({
      items,
      offset: -allItemsWidth + menuWidth,
      wWidth,
      menuPos,
      menuWidth,
    });
    const lastPageOffset = this.getCenterOffset({
      items: visibleItemsEnd,
      menuWidth,
    });
    return lastPageOffset;
  };

  /** get offsets to first and last item */
  getPagesOffsets = ({
    items = this.menuItems,
    allItemsWidth = this.allItemsWidth,
    wWidth = this.wWidth,
    menuPos = this.menuPos,
    menuWidth = this.menuWidth,
    offset = this.state.translate,
  }): {
    firstPageOffset: number;
    lastPageOffset: number;
  } => {
    const firstPageOffset = this.getFirstPageOffset({
      items,
      menuWidth,
      offset,
      wWidth,
      menuPos,
    });
    const lastPageOffset = this.getLastPageOffset({
      items,
      menuWidth,
      menuPos,
      wWidth,
      allItemsWidth,
    });

    return {
      firstPageOffset,
      lastPageOffset,
    };
  };

  /** item click handler */
  onItemClick = (id: string): Void => {
    const { clickWhenDrag, onSelect } = this.props;
    const { xDraggedDistance } = this.state;

    const afterScroll = xDraggedDistance > 5;

    if (afterScroll && !clickWhenDrag) return false;

    this.selected = id;
    if (onSelect) onSelect(id);
  };

  /** get item visible with current/provided translate */
  getVisibleItems = ({
    items = this.menuItems,
    wWidth = this.wWidth,
    menuPos = this.menuPos,
    menuWidth = this.menuWidth,
    offset = this.state.translate,
    translate = this.state.translate || defaultProps.translate,
  }): MenuItems => {
    return items.filter(el => {
      const { width: elWidth } = getClientRect(el[1].elem);
      const id = this.getItemInd(items, el);
      const x = this.getOffsetToItemByIndex({
        index: id,
        menuItems: items,
        translate,
      });

      return this.elemVisible({
        x,
        elWidth,
        wWidth,
        menuPos,
        menuWidth,
        offset,
      });
    });
  };

  /** check if single menu item visible by it's position and width*/
  elemVisible = ({
    x,
    offset = 0,
    elWidth,
    wWidth = this.wWidth,
    menuPos = this.menuPos,
    menuWidth = this.menuWidth,
  }: {
    x: number;
    offset: number;
    elWidth: number;
    wWidth?: number;
    menuPos?: number;
    menuWidth?: number;
  }): boolean => {
    const leftEdge = menuPos - 1;
    const rightEdge = wWidth - (wWidth - (menuPos + menuWidth)) + 1;
    const pos = x + offset;
    const posWithWidth = pos + elWidth;
    return pos >= leftEdge && posWithWidth <= rightEdge;
  };

  /** get index of item */
  getItemInd = (
    menuItems: MenuItems = this.menuItems,
    item: MenuItem
  ): number => {
    if (!menuItems || !item) return 0;
    return menuItems.findIndex(el => el[0] === item[0]);
  };

  /** get next item in data */
  getNextItemInd = (left: boolean, visibleItems: MenuItems): number => {
    const { menuItems } = this;
    if (left) {
      if (!visibleItems.length) return 0;
    } else {
      if (!visibleItems.length) return menuItems.length;
    }
    const ind = left
      ? this.getItemInd(menuItems, visibleItems[0]) - 1
      : this.getItemInd(menuItems, visibleItems.slice(-1)[0]) + 1;
    return ind < 0 ? 0 : ind;
  };

  /** get offset from start to item by it's key */
  getOffsetToItemByKey = (key: string): number => {
    let { translate } = this.state;

    const itemIndex = this.getItemIndexByKey(key);
    if (itemIndex === -1) return translate;

    const { menuPos } = this;
    const { alignCenter } = this.props;

    translate = this.getOffsetToItemByIndex({ index: itemIndex });

    const visibleItemsWithNewTranslate = this.getVisibleItems({
      offset: -translate,
    });
    const offset = alignCenter
      ? this.getCenterOffset({ items: visibleItemsWithNewTranslate })
      : defaultProps.translate;

    translate = -(translate - menuPos - offset);

    if (this.itBeforeStart(translate)) {
      translate = this.getOffsetAtStart();
    } else if (this.itAfterEnd(translate)) {
      translate = this.getOffsetAtEnd();
    }
    return translate;
  };

  /** get item from key */
  getItemByKey = (key: string): MenuItem => {
    return (
      this.menuItems.find(el => el[1].key === key) || [
        'null',
        { key: 'n', elem: null },
      ]
    );
  };

  /** get index of item from it's key */
  getItemIndexByKey = (itemKey: string): number => {
    if (!itemKey) return -1;
    return this.props.data.findIndex(el => el.key === itemKey);
  };

  /** offset from start to item */
  getOffsetToItemByIndex = ({
    index,
    menuItems = this.menuItems,
    translate = this.state.translate,
  }: {
    index: number;
    menuItems?: MenuItems;
    translate?: number;
  }): number => {
    if (!menuItems.length) return 0;
    const ind = index >= menuItems.length ? menuItems.length - 1 : index;
    const { x } = getClientRect(menuItems[ind][1].elem);
    const position = +x - translate;
    return position;
  };

  /** get new offset value when scroll right */
  getScrollRightOffset = (
    visibleItems: MenuItems,
    items: MenuItems
  ): number => {
    const { alignCenter } = this.props;
    const { menuPos, lastPageOffset } = this;

    const nextItem = this.getNextItem(
      visibleItems && visibleItems.slice(-1)[0]
        ? visibleItems.slice(-1)[0][0]
        : items.slice(-1)[0][0]
    );
    const nextItemIndex = items.findIndex(el => el[0] === nextItem[0]);

    const offsetToItem = this.getOffsetToItemByIndex({
      index: nextItemIndex,
      menuItems: items,
    });
    const offsetToItemOnStart = offsetToItem - menuPos;

    const nextVisibleItems = this.getVisibleItems({
      items,
      offset: -offsetToItemOnStart,
    });

    if (nextVisibleItems.includes(items.slice(-1)[0])) {
      return alignCenter
        ? offsetToItemOnStart + lastPageOffset
        : offsetToItemOnStart;
    }

    const centerOffset = () =>
      this.getCenterOffset({ items: nextVisibleItems });

    const newOffset = alignCenter
      ? offsetToItemOnStart - centerOffset()
      : offsetToItemOnStart;
    return newOffset;
  };

  /** get new offset value when scroll left */
  getScrollLeftOffset = (visibleItems: MenuItems, items: MenuItems): number => {
    const { alignCenter } = this.props;
    const { menuPos, menuWidth, firstPageOffset } = this;

    const prevItem = this.getPrevItem(
      visibleItems && visibleItems[0] ? visibleItems[0][0] : items[0][0]
    );
    const prevItemIndex = items.findIndex(el => el[0] === prevItem[0]);

    const offsetToItem = this.getOffsetToItemByIndex({
      index: prevItemIndex,
      menuItems: items,
    });
    const itemWidth = this.getItemsWidth({ items: [prevItem] });
    const offsetToItemOnEnd = offsetToItem - menuPos - (menuWidth - itemWidth);

    const nextVisibleItems = this.getVisibleItems({
      items,
      offset: -offsetToItemOnEnd,
    });

    if (nextVisibleItems.includes(items[0])) {
      return alignCenter ? -firstPageOffset : defaultProps.translate;
    }

    const centerOffset = () =>
      this.getCenterOffset({ items: nextVisibleItems });

    const newOffset = alignCenter
      ? offsetToItemOnEnd + centerOffset()
      : offsetToItemOnEnd;
    return newOffset;
  };

  /** get next item by key */
  getNextItem = (key: string): MenuItem => {
    const { menuItems } = this;
    const itemIndex = menuItems.findIndex(el => el[0] === key);
    const nextItemIndex = itemIndex + 1;
    const nextItem = menuItems[nextItemIndex] || menuItems.slice(-1)[0];
    return nextItem;
  };

  /** get prrev item by key */
  getPrevItem = (key: string): MenuItem => {
    const { menuItems } = this;
    const itemIndex = menuItems.findIndex(el => el[0] === key);
    const prevItemIndex = itemIndex - 1;
    const prevItem = menuItems[prevItemIndex] || menuItems[0];
    return prevItem;
  };

  /** get new offset value when scroll left/right */
  getOffset = (left: boolean): number => {
    const { menuItems: items } = this;
    const visibleItems = this.getVisibleItems({ items });
    const newOffset = left
      ? this.getScrollLeftOffset(visibleItems, items)
      : this.getScrollRightOffset(visibleItems, items);
    return newOffset;
  };

  /** offset from 0 to first menu item when scroll,
   * need pass items visible on screen
   */
  getCenterOffset = ({
    items = this.menuItems,
    menuWidth = this.menuWidth,
  }: {
    items?: MenuItems;
    menuWidth?: number;
  }): number => {
    if (!items.length) {
      return 0;
    }
    const itemsWidth = this.getItemsWidth({ items });
    const offset = (menuWidth - itemsWidth) / 2;
    return offset;
  };

  /** mouse wheel handler */
  handleWheel = (e: WheelEvent): Void => {
    const { wheel } = this.props;
    if (!wheel) return false;
    if (e.deltaY < 0) {
      this.handleArrowClick();
    } else {
      this.handleArrowClick(false);
    }
  };

  /** offset at start */
  getOffsetAtStart = (): number => {
    const { firstPageOffset } = this;
    const { alignCenter } = this.props;
    return alignCenter ? firstPageOffset : defaultProps.translate;
  };

  /** offset at end */
  getOffsetAtEnd = (): number => {
    const { alignCenter } = this.props;
    const { allItemsWidth, menuWidth, lastPageOffset } = this;
    const offset = allItemsWidth - menuWidth;
    return alignCenter ? -offset - lastPageOffset : -offset;
  };

  /** click right arrow */
  handleArrowClickRight = (): Void => {
    this.handleArrowClick(false);
  };

  /** click arrow/scroll */
  handleArrowClick = (left = true): Void => {
    const { alignCenter } = this.props;
    const { allItemsWidth, menuWidth } = this;

    if (!alignCenter && !left && allItemsWidth < menuWidth) {
      return false;
    }

    const offset = this.getOffset(left);
    let transl = -offset;

    if (left && this.itBeforeStart(transl)) {
      transl = this.getOffsetAtStart();
    } else if (!left && this.itAfterEnd(transl)) {
      transl = this.getOffsetAtEnd();
    }

    const newTranslate = transl;

    this.setState({
      translate: newTranslate,
      xPoint: defaultProps.xPoint,
      startDragTranslate: 0,
      xDraggedDistance: 0,
    });
  };

  /** check if position before first element */
  itBeforeStart = (trans: number): boolean => {
    const { alignCenter } = this.props;
    const { menuWidth, allItemsWidth, firstPageOffset } = this;
    if (allItemsWidth < menuWidth) return true;
    return alignCenter
      ? trans > firstPageOffset
      : trans > defaultProps.translate;
  };
  /** check if position after last element */
  itAfterEnd = (trans: number): boolean => {
    const { alignCenter } = this.props;
    const { menuWidth, allItemsWidth, lastPageOffset } = this;
    if (allItemsWidth < menuWidth) return true;
    return alignCenter
      ? trans < defaultProps.translate &&
          Math.abs(trans) > allItemsWidth - menuWidth + lastPageOffset
      : trans < defaultProps.translate &&
          Math.abs(trans) > allItemsWidth - menuWidth;
  };

  /** get coords from mouse event */
  getPoint = (ev: React.MouseEvent | React.TouchEvent | Event): number => {
    if ('touches' in ev) {
      return ev.touches[0].clientX;
    } else if ('clientX' in ev) {
      return ev.clientX;
    } else {
      return 0;
    }
  };

  /** event handler when start drag and mouse down  */
  handleDragStart = (ev: React.MouseEvent | React.TouchEvent): Void => {
    // 1 left button, 2 right button
    if (ev && 'buttons' in ev && ev.buttons === 2) return false;
    const { dragging: draggingEnable } = this.props;
    if (!draggingEnable) return false;
    const { translate: startDragTranslate } = this.state;
    this.setState({
      dragging: true,
      xPoint: 0,
      startDragTranslate,
      xDraggedDistance: 0,
    });
  };

  /** drag event handler */
  handleDrag = (e: React.MouseEvent | React.TouchEvent | Event): Void => {
    const { dragging: draggingEnable } = this.props;
    const { translate, dragging, xPoint, xDraggedDistance } = this.state;
    if (!draggingEnable || !dragging) return false;

    const point = this.getPoint(e);
    const diff =
      xPoint === defaultProps.xPoint ? defaultProps.xPoint : xPoint - point;
    let result = translate - diff;

    // don't let scroll over start and end
    if (this.itBeforeStart(result)) {
      result = result - Math.abs(diff) / 2;
    } else if (this.itAfterEnd(result)) {
      result = result + Math.abs(diff) / 2;
    }

    const newTranslate = result;

    this.setState({
      xPoint: point,
      translate: newTranslate,
      xDraggedDistance: xDraggedDistance + Math.abs(diff),
    });
  };

  /** event handler when drag and mouse up  */
  handleDragStop = (e: React.MouseEvent | React.TouchEvent | Event): Void => {
    const { allItemsWidth, menuWidth, firstPageOffset, lastPageOffset } = this;
    let {
      dragging,
      xPoint = this.getPoint(e),
      translate,
      startDragTranslate,
    } = this.state;
    const { dragging: draggingEnable, alignCenter } = this.props;
    if (!draggingEnable || !dragging) return false;

    let newTranslate = translate;

    if (this.itBeforeStart(translate)) {
      newTranslate = this.getOffsetAtStart();
      xPoint = defaultProps.xPoint;
    } else if (this.itAfterEnd(translate)) {
      newTranslate = this.getOffsetAtEnd()
      xPoint = defaultProps.xPoint;
    }

    if (!alignCenter && allItemsWidth <= menuWidth ) {
      newTranslate = defaultProps.translate;
      xPoint = defaultProps.xPoint;
    }

    newTranslate = newTranslate;

    this.setState(
      {
        dragging: false,
        xPoint,
        translate: newTranslate,
      },
      () =>
        this.onUpdate({
          translate: newTranslate,
          translateOld: startDragTranslate,
        })
    );
  };

  /** check if no need show arrows */
  isArrowsVisible = (): boolean => {
    const {
      allItemsWidth,
      menuWidth,
      props: { hideArrows },
    } = this;
    const hide = Boolean(hideArrows && allItemsWidth <= menuWidth);
    return !hide;
  };

  /** cb for position update */
  onUpdate = ({
    translate = this.state.translate,
    translateOld = this.state.translate,
  }: {
    translate?: number;
    translateOld?: number;
  }): Void => {
    const { onUpdate } = this.props;
    const { lastTranslateUpdate } = this;
    if (
      onUpdate &&
      translate !== translateOld &&
      translate !== lastTranslateUpdate
    ) {
      this.lastTranslateUpdate = translate;
      onUpdate({ translate });
    }
  };

  public render(): React.ReactNode | null {
    const {
      arrowClass,
      arrowDisabledClass,
      arrowLeft,
      arrowRight,
      data,
      innerWrapperClass,
      itemClass,
      itemClassActive,
      hideArrows,
      menuStyle,
      menuClass,
      transition,
      wrapperClass,
      wrapperStyle,
      forwardClick,
    } = this.props;
    const {
      translate,
      dragging,
      leftArrowVisible,
      rightArrowVisible,
    } = this.state;
    const { selected, mounted } = this;

    if (!data || !data.length) return null;

    const arrowsVisible = mounted ? this.isArrowsVisible() : true;

    const menuStyles = { ...defaultMenuStyle, ...menuStyle };
    const wrapperStyles = { ...defaultWrapperStyle, ...wrapperStyle };

    const arrowProps = {
      className: arrowClass,
      hideArrows,
      disabledClass: arrowDisabledClass,
      forwardClick,
    };

    return (
      <div className={menuClass} style={menuStyles} onWheel={this.handleWheel}>
        {arrowLeft && (
          <ArrowWrapper {...arrowProps}
            isDisabled={!arrowsVisible || !leftArrowVisible}
            onClick={this.handleArrowClick}
          >
            {arrowLeft}
          </ArrowWrapper>
        )}

        <div
          className={wrapperClass}
          style={wrapperStyles}
          ref={this.setWrapperRef}
          onMouseDown={this.handleDragStart}
          onTouchStart={this.handleDragStart}
          onTouchEnd={this.handleDragStop}
          onMouseMove={this.handleDrag}
          onTouchMove={this.handleDrag}
        >
          <InnerWrapper
            data={data}
            translate={translate}
            dragging={dragging}
            mounted={mounted}
            transition={mounted ? transition : 0}
            selected={selected}
            setRef={this.setRef}
            setMenuInnerRef={this.setMenuInnerRef}
            onClick={this.onItemClick}
            innerWrapperClass={innerWrapperClass}
            itemClass={itemClass}
            itemClassActive={itemClassActive}
            forwardClick={forwardClick}
          />
        </div>

        {arrowRight && (
          <ArrowWrapper {...arrowProps}
            isDisabled={!arrowsVisible || !rightArrowVisible}
            onClick={this.handleArrowClickRight}
          >
            {arrowRight}
          </ArrowWrapper>
        )}
      </div>
    );
  }
}

const checkVersion = (that: any): Void => {
  const version = (React.version).match(/^(\d{1,2})\./);
  if (+(version![1]) >= 16) {
    that.componentDidCatch = (err: any, info: any): Void => {
      console.log('ScrollMenu catched error: ', err, info);
    }
  }
};

export default ScrollMenu;

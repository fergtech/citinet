import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { LinkPreviewView } from './LinkPreviewView';

export const LinkPreview = Node.create({
  name: 'linkPreview',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url:         { default: null },
      title:       { default: '' },
      description: { default: '' },
      image:       { default: null },
      siteName:    { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="link-preview"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'link-preview' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkPreviewView);
  },
});

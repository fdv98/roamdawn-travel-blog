import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
export async function GET(context){const posts=await getCollection('blog',{filter:({data})=>!data.draft});return rss({title:'RoamDawn Travel Guides',description:'Practical travel guides, destinations and itineraries.',site:context.site,items:posts.sort((a,b)=>b.data.publishDate.valueOf()-a.data.publishDate.valueOf()).map(post=>({title:post.data.title,pubDate:post.data.publishDate,description:post.data.description,link:`/blog/${post.id}/`}))});}

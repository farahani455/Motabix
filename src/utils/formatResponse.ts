    export function formatResponse(input:string):string{
        return input.replace(/<br>/ig,'\n')
    }